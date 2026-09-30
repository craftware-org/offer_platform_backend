import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';
import { DB, type Database } from '../../infrastructure/database/database.module.js';
import { EmailProvider } from '../../infrastructure/email/email.module.js';
import { RateLimiterService } from '../../infrastructure/redis/rate-limiter.service.js';
import { SmsProvider } from '../../infrastructure/sms/sms.module.js';
import { otpChallenges, type OtpChannel } from './auth.schema.js';

const VERIFY_LIMIT_PER_DESTINATION = 10;
const VERIFY_WINDOW_SECONDS = 15 * 60;

const invalidCode = (message = 'Invalid or expired code') =>
  new AppError(ErrorCode.OTP_INVALID, HttpStatus.BAD_REQUEST, message);
const attemptsExceeded = () =>
  new AppError(
    ErrorCode.OTP_ATTEMPTS_EXCEEDED,
    HttpStatus.BAD_REQUEST,
    'Too many wrong attempts. Request a new code.',
  );

/** Where a code goes: an E.164 phone number by SMS, or a lower-case email address. */
export interface OtpTarget {
  channel: OtpChannel;
  destination: string;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Login codes over SMS or email, with identical security rules for both (ADR-0006, ADR-0013). */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly rateLimiter: RateLimiterService,
    private readonly sms: SmsProvider,
    private readonly email: EmailProvider,
  ) {}

  /** Issues a new code (invalidating earlier ones for the same destination) and sends it. */
  async request(
    target: OtpTarget,
    clientIp: string,
  ): Promise<{ expiresInSeconds: number; resendAfterSeconds: number }> {
    const c = this.config;
    const { destination } = target;
    await this.rateLimiter.consume(`otp:ip:${clientIp}`, c.OTP_MAX_REQUESTS_PER_IP_PER_HOUR, 3600);
    if (c.OTP_RESEND_COOLDOWN_SECONDS > 0) {
      await this.rateLimiter.consume(`otp:cooldown:${destination}`, 1, c.OTP_RESEND_COOLDOWN_SECONDS);
    }
    await this.rateLimiter.consume(`otp:dest:${destination}`, c.OTP_MAX_REQUESTS_PER_PHONE_PER_HOUR, 3600);

    const code = randomInt(0, 10 ** c.OTP_LENGTH)
      .toString()
      .padStart(c.OTP_LENGTH, '0');
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .update(otpChallenges)
        .set({ consumedAt: now })
        .where(and(eq(otpChallenges.destination, destination), isNull(otpChallenges.consumedAt)));
      await tx.insert(otpChallenges).values({
        channel: target.channel,
        destination,
        codeHash: this.hash(destination, code),
        maxAttempts: c.OTP_MAX_ATTEMPTS,
        expiresAt: new Date(now.getTime() + c.OTP_TTL_SECONDS * 1000),
      });
    });

    try {
      await this.deliver(target, code);
    } catch (error) {
      this.logger.error({ err: error, channel: target.channel }, 'Login code delivery failed');
      throw new AppError(
        ErrorCode.SERVICE_UNAVAILABLE,
        HttpStatus.SERVICE_UNAVAILABLE,
        'Could not send the code, please try again',
      );
    }
    return { expiresInSeconds: c.OTP_TTL_SECONDS, resendAfterSeconds: c.OTP_RESEND_COOLDOWN_SECONDS };
  }

  /**
   * Checks a code against the destination's latest live challenge and consumes it on success.
   * Attempts are counted atomically, so parallel guesses cannot exceed the limit.
   */
  async verify(destination: string, code: string): Promise<void> {
    await this.rateLimiter.consume(
      `otp:verify:${destination}`,
      VERIFY_LIMIT_PER_DESTINATION,
      VERIFY_WINDOW_SECONDS,
    );

    const now = new Date();
    const [challenge] = await this.db
      .select()
      .from(otpChallenges)
      .where(
        and(
          eq(otpChallenges.destination, destination),
          isNull(otpChallenges.consumedAt),
          gt(otpChallenges.expiresAt, now),
        ),
      )
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1);
    if (!challenge) throw invalidCode();

    const [counted] = await this.db
      .update(otpChallenges)
      .set({ attempts: sql`${otpChallenges.attempts} + 1` })
      .where(and(eq(otpChallenges.id, challenge.id), lt(otpChallenges.attempts, otpChallenges.maxAttempts)))
      .returning({ attempts: otpChallenges.attempts, maxAttempts: otpChallenges.maxAttempts });
    if (!counted) throw attemptsExceeded();

    if (!this.matches(challenge.codeHash, this.hash(destination, code))) {
      const remaining = counted.maxAttempts - counted.attempts;
      if (remaining <= 0) throw attemptsExceeded();
      throw invalidCode(`Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
    }

    const [consumed] = await this.db
      .update(otpChallenges)
      .set({ consumedAt: new Date() })
      .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)))
      .returning({ id: otpChallenges.id });
    if (!consumed) throw invalidCode(); // consumed concurrently: a code works exactly once
  }

  private async deliver(target: OtpTarget, code: string): Promise<void> {
    const app = this.config.APP_DISPLAY_NAME;
    const minutes = Math.round(this.config.OTP_TTL_SECONDS / 60);
    if (target.channel === 'SMS') {
      await this.sms.send(
        target.destination,
        `${code} is your ${app} verification code. It expires in ${minutes} minutes. Do not share it with anyone.`,
      );
      return;
    }
    const text =
      `${code} is your ${app} login code. It expires in ${minutes} minutes.\n\n` +
      `Never share this code with anyone. If you didn't try to log in, you can ignore this email.`;
    await this.email.send({
      to: target.destination,
      subject: `${code} is your ${app} login code`,
      text,
      html:
        `<p style="font-family:sans-serif;font-size:16px">Your ${escapeHtml(app)} login code is</p>` +
        `<p style="font-family:monospace;font-size:32px;letter-spacing:6px;font-weight:bold">${code}</p>` +
        `<p style="font-family:sans-serif;color:#555">It expires in ${minutes} minutes. Never share it with anyone. ` +
        `If you didn't try to log in, you can ignore this email.</p>`,
    });
  }

  /** HMAC bound to the destination, so a leaked hash cannot be reused for another phone/email. */
  private hash(destination: string, code: string): string {
    return createHmac('sha256', this.config.OTP_HASH_SECRET).update(`${destination}:${code}`).digest('hex');
  }

  private matches(expectedHex: string, actualHex: string): boolean {
    const a = Buffer.from(expectedHex, 'hex');
    const b = Buffer.from(actualHex, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
