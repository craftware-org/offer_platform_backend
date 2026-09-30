import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';
import { DB, type Database } from '../../infrastructure/database/database.module.js';
import { RateLimiterService } from '../../infrastructure/redis/rate-limiter.service.js';
import { SmsProvider } from '../../infrastructure/sms/sms.module.js';
import { otpChallenges } from './auth.schema.js';

const VERIFY_LIMIT_PER_PHONE = 10;
const VERIFY_WINDOW_SECONDS = 15 * 60;

const invalidCode = (message = 'Invalid or expired code') =>
  new AppError(ErrorCode.OTP_INVALID, HttpStatus.BAD_REQUEST, message);

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly rateLimiter: RateLimiterService,
    private readonly sms: SmsProvider,
  ) {}

  /** Issues a new code (invalidating earlier ones) and sends it by SMS. */
  async request(
    phone: string,
    clientIp: string,
  ): Promise<{ expiresInSeconds: number; resendAfterSeconds: number }> {
    const c = this.config;
    await this.rateLimiter.consume(`otp:ip:${clientIp}`, c.OTP_MAX_REQUESTS_PER_IP_PER_HOUR, 3600);
    if (c.OTP_RESEND_COOLDOWN_SECONDS > 0) {
      await this.rateLimiter.consume(`otp:cooldown:${phone}`, 1, c.OTP_RESEND_COOLDOWN_SECONDS);
    }
    await this.rateLimiter.consume(`otp:phone:${phone}`, c.OTP_MAX_REQUESTS_PER_PHONE_PER_HOUR, 3600);

    const code = randomInt(0, 10 ** c.OTP_LENGTH)
      .toString()
      .padStart(c.OTP_LENGTH, '0');
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .update(otpChallenges)
        .set({ consumedAt: now })
        .where(and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt)));
      await tx.insert(otpChallenges).values({
        phone,
        codeHash: this.hash(phone, code),
        maxAttempts: c.OTP_MAX_ATTEMPTS,
        expiresAt: new Date(now.getTime() + c.OTP_TTL_SECONDS * 1000),
      });
    });

    const minutes = Math.round(c.OTP_TTL_SECONDS / 60);
    try {
      await this.sms.send(
        phone,
        `${code} is your ${c.APP_DISPLAY_NAME} verification code. It expires in ${minutes} minutes. Do not share it with anyone.`,
      );
    } catch (error) {
      this.logger.error({ err: error }, 'SMS delivery failed');
      throw new AppError(
        ErrorCode.SERVICE_UNAVAILABLE,
        HttpStatus.SERVICE_UNAVAILABLE,
        'Could not send the code, please try again',
      );
    }
    return { expiresInSeconds: c.OTP_TTL_SECONDS, resendAfterSeconds: c.OTP_RESEND_COOLDOWN_SECONDS };
  }

  /**
   * Checks a code against the phone's latest live challenge and consumes it on success.
   * Attempts are counted atomically, so parallel guesses cannot exceed the limit.
   */
  async verify(phone: string, code: string): Promise<void> {
    await this.rateLimiter.consume(`otp:verify:${phone}`, VERIFY_LIMIT_PER_PHONE, VERIFY_WINDOW_SECONDS);

    const now = new Date();
    const [challenge] = await this.db
      .select()
      .from(otpChallenges)
      .where(
        and(
          eq(otpChallenges.phone, phone),
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
    if (!counted) {
      throw new AppError(
        ErrorCode.OTP_ATTEMPTS_EXCEEDED,
        HttpStatus.BAD_REQUEST,
        'Too many wrong attempts. Request a new code.',
      );
    }

    if (!this.matches(challenge.codeHash, this.hash(phone, code))) {
      const remaining = counted.maxAttempts - counted.attempts;
      if (remaining <= 0) {
        throw new AppError(
          ErrorCode.OTP_ATTEMPTS_EXCEEDED,
          HttpStatus.BAD_REQUEST,
          'Too many wrong attempts. Request a new code.',
        );
      }
      throw invalidCode(`Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
    }

    const [consumed] = await this.db
      .update(otpChallenges)
      .set({ consumedAt: new Date() })
      .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)))
      .returning({ id: otpChallenges.id });
    if (!consumed) throw invalidCode(); // consumed concurrently: a code works exactly once
  }

  /** HMAC bound to the phone, so a leaked hash cannot be reused for another number. */
  private hash(phone: string, code: string): string {
    return createHmac('sha256', this.config.OTP_HASH_SECRET).update(`${phone}:${code}`).digest('hex');
  }

  private matches(expectedHex: string, actualHex: string): boolean {
    const a = Buffer.from(expectedHex, 'hex');
    const b = Buffer.from(actualHex, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
