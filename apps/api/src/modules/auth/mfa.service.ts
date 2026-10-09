import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, hkdfSync, randomBytes } from 'node:crypto';
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import QRCode from 'qrcode';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';
import { DB, type Database, type Executor } from '../../infrastructure/database/database.module.js';
import { RateLimiterService } from '../../infrastructure/redis/rate-limiter.service.js';
import { REDIS } from '../../infrastructure/redis/redis.token.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { UsersService } from '../users/users.service.js';
import { mfaRecoveryCodes, userMfa } from './auth.schema.js';
import { TokenService, type TokenPair } from './token.service.js';
import { newTotpSecret, otpauthUrl, SecretBox, base32Encode, verifyTotp } from './totp.js';

/** How long the "enter your authenticator code" step stays open after the password/code step. */
const CHALLENGE_TTL_SECONDS = 5 * 60;
/** How long a scanned-but-not-confirmed setup is kept. */
const SETUP_TTL_SECONDS = 10 * 60;
/** Wrong authenticator or recovery codes allowed per account before a temporary lock. */
const MAX_FAILURES = 5;
const LOCK_SECONDS = 15 * 60;
const RECOVERY_CODES = 10;

export const mfaInvalid = () =>
  new AppError(
    ErrorCode.MFA_INVALID,
    HttpStatus.UNAUTHORIZED,
    'That code is not correct. Check your authenticator app and try again.',
  );

export interface MfaChallenge {
  mfaRequired: true;
  /** Short-lived token for POST /auth/mfa/verify; it can't be used as an access token. */
  mfaToken: string;
  mfaTokenExpiresIn: number;
}

export interface MfaStatus {
  enabled: boolean;
  enabledAt: Date | null;
  recoveryCodesLeft: number;
}

export interface MfaSetup {
  /** For typing into the app by hand when scanning isn't possible. */
  secret: string;
  otpauthUrl: string;
  /** PNG of the QR code as a data: URL. */
  qrDataUrl: string;
}

interface RequestContext {
  userAgent?: string;
  requestId?: string;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
/** Recovery codes look like "7KQ2-M9XD": easy to read, ~40 bits each, single use. */
const newRecoveryCode = () => {
  const raw = base32Encode(randomBytes(5)).slice(0, 8);
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
};
const normalizeRecoveryCode = (code: string) => code.toUpperCase().replace(/[^A-Z2-7]/g, '');

/**
 * Authenticator-app 2-step login (owner decision 2026-10-09, ADR-0018). Required for every admin
 * permission; any user may turn it on. Lost phone: one of the recovery codes, a Super admin reset,
 * or `admin:reset-mfa` on the server.
 */
@Injectable()
export class MfaService {
  private readonly box: SecretBox;
  private readonly challengeSecret: string;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly rateLimiter: RateLimiterService,
    private readonly audit: AuditService,
  ) {
    this.box = new SecretBox(config.OTP_HASH_SECRET);
    // A different key from access tokens, so a challenge token can never pass as one.
    this.challengeSecret = Buffer.from(
      hkdfSync('sha256', config.JWT_ACCESS_SECRET, Buffer.alloc(0), 'offer-platform/mfa-challenge-v1', 32),
    ).toString('base64url');
  }

  async isEnabled(userId: string, db: Executor = this.db): Promise<boolean> {
    const [row] = await db.select({ userId: userMfa.userId }).from(userMfa).where(eq(userMfa.userId, userId));
    return !!row;
  }

  async status(userId: string): Promise<MfaStatus> {
    const [row] = await this.db.select().from(userMfa).where(eq(userMfa.userId, userId));
    const [left] = await this.db
      .select({ value: count() })
      .from(mfaRecoveryCodes)
      .where(and(eq(mfaRecoveryCodes.userId, userId), isNull(mfaRecoveryCodes.usedAt)));
    return {
      enabled: !!row,
      enabledAt: row?.enabledAt ?? null,
      recoveryCodesLeft: row ? (left?.value ?? 0) : 0,
    };
  }

  // ---- Setting it up ---------------------------------------------------------------------------

  /** Step 1: a new secret and its QR code. Nothing changes until the first code is confirmed. */
  async startSetup(userId: string): Promise<MfaSetup> {
    if (await this.isEnabled(userId))
      throw AppError.conflict('2-step login is already on. Turn it off first to set up a new phone.');
    const user = await this.users.getView(userId);
    const secret = newTotpSecret();
    await this.redis.set(`mfa:setup:${userId}`, this.box.seal(secret), 'EX', SETUP_TTL_SECONDS);
    const url = otpauthUrl(secret, this.config.APP_DISPLAY_NAME, user.email ?? user.phone ?? userId);
    return {
      secret: base32Encode(secret),
      otpauthUrl: url,
      qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 240 }),
    };
  }

  /**
   * Step 2: the first code from the app proves it was set up. Turns 2-step login on, returns the
   * recovery codes (shown once) and a fresh session that passed the step. Every other session ends.
   */
  async enable(
    userId: string,
    code: string,
    ctx: RequestContext,
  ): Promise<{ recoveryCodes: string[]; tokens: TokenPair }> {
    const sealed = await this.redis.get(`mfa:setup:${userId}`);
    if (!sealed)
      throw AppError.validation({ code: 'The setup expired. Start again and scan the new QR code.' });
    await this.guardAttempts(userId);
    const secret = this.box.open(sealed);
    const step = verifyTotp(secret, code, new Date(), null);
    if (step === null) return this.fail(userId);

    const recoveryCodes = Array.from({ length: RECOVERY_CODES }, newRecoveryCode);
    const tokens = await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(userMfa)
        .values({ userId, secretEnc: sealed, lastStep: step, enabledAt: new Date() })
        .onConflictDoNothing()
        .returning({ userId: userMfa.userId });
      if (inserted.length === 0) throw AppError.conflict('2-step login is already on.');
      await this.replaceRecoveryCodes(userId, recoveryCodes, tx);
      await this.tokens.revokeAllForUser(userId, tx);
      await this.record(AuditAction.MFA_ENABLED, userId, userId, ctx, tx);
      return this.tokens.issue(userId, ctx.userAgent, tx, true);
    });
    await this.redis.del(`mfa:setup:${userId}`);
    await this.rateLimiter.clear(`mfa:fail:${userId}`);
    return { recoveryCodes, tokens };
  }

  /** New recovery codes (the old ones stop working). Needs a current authenticator code. */
  async regenerateRecoveryCodes(userId: string, code: string, ctx: RequestContext): Promise<string[]> {
    await this.checkTotp(userId, code);
    const codes = Array.from({ length: RECOVERY_CODES }, newRecoveryCode);
    await this.db.transaction(async (tx) => {
      await this.replaceRecoveryCodes(userId, codes, tx);
      await this.record(AuditAction.MFA_RECOVERY_CODES_RENEWED, userId, userId, ctx, tx);
    });
    return codes;
  }

  /** Turns 2-step login off (needs a current code). Ends every session. */
  async disable(userId: string, code: string, ctx: RequestContext): Promise<void> {
    await this.checkTotp(userId, code);
    await this.db.transaction(async (tx) => {
      await this.remove(userId, tx);
      await this.record(AuditAction.MFA_DISABLED, userId, userId, ctx, tx);
    });
  }

  /** A Super admin (or the server CLI) clears someone's authenticator, e.g. after a lost phone. */
  async reset(actorUserId: string | null, userId: string, ctx: RequestContext): Promise<void> {
    await this.users.getView(userId); // 404 for unknown users
    await this.db.transaction(async (tx) => {
      await this.remove(userId, tx);
      await this.record(AuditAction.MFA_RESET, actorUserId, userId, ctx, tx);
    });
    await this.rateLimiter.clear(`mfa:fail:${userId}`);
  }

  // ---- Logging in ------------------------------------------------------------------------------

  /** After the password/code step, for users with 2-step login on. */
  async challenge(userId: string): Promise<MfaChallenge> {
    const mfaToken = await this.jwt.signAsync(
      { sub: userId, purpose: 'mfa' },
      { secret: this.challengeSecret, expiresIn: CHALLENGE_TTL_SECONDS, audience: 'offer-platform-mfa' },
    );
    return { mfaRequired: true, mfaToken, mfaTokenExpiresIn: CHALLENGE_TTL_SECONDS };
  }

  /**
   * Second step: an authenticator code (or one recovery code) for the challenge. Starts a session
   * that passed the step. Returns the user id so the caller can build the usual login response.
   */
  async completeChallenge(
    mfaToken: string,
    answer: { code?: string; recoveryCode?: string },
    ctx: RequestContext,
  ): Promise<{ userId: string; tokens: TokenPair }> {
    let userId: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string; purpose?: string }>(mfaToken, {
        secret: this.challengeSecret,
        audience: 'offer-platform-mfa',
      });
      if (payload.purpose !== 'mfa' || typeof payload.sub !== 'string') throw new Error('wrong token');
      userId = payload.sub;
    } catch {
      throw new AppError(
        ErrorCode.UNAUTHENTICATED,
        HttpStatus.UNAUTHORIZED,
        'This login step expired. Please log in again.',
      );
    }

    if (answer.recoveryCode) {
      await this.guardAttempts(userId);
      const used = await this.db
        .update(mfaRecoveryCodes)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(mfaRecoveryCodes.userId, userId),
            eq(mfaRecoveryCodes.codeHash, sha256(normalizeRecoveryCode(answer.recoveryCode))),
            isNull(mfaRecoveryCodes.usedAt),
          ),
        )
        .returning({ id: mfaRecoveryCodes.id });
      if (used.length === 0) return this.fail(userId);
      await this.record(AuditAction.MFA_RECOVERY_CODE_USED, userId, userId, ctx, this.db);
    } else {
      await this.checkTotp(userId, answer.code ?? '');
    }
    await this.rateLimiter.clear(`mfa:fail:${userId}`);
    return { userId, tokens: await this.tokens.issue(userId, ctx.userAgent, this.db, true) };
  }

  // ---- Helpers ---------------------------------------------------------------------------------

  /** Checks an authenticator code for an enrolled user; a code works once (replay-safe). */
  private async checkTotp(userId: string, code: string): Promise<void> {
    await this.guardAttempts(userId);
    const [row] = await this.db.select().from(userMfa).where(eq(userMfa.userId, userId));
    if (!row) throw AppError.validation({ code: '2-step login is not turned on for this account.' });
    const step = verifyTotp(this.box.open(row.secretEnc), code, new Date(), row.lastStep);
    if (step === null) return this.fail(userId);
    // Only one request can claim a step, even if two arrive at the same moment.
    const claimed = await this.db
      .update(userMfa)
      .set({ lastStep: step })
      .where(and(eq(userMfa.userId, userId), sql`coalesce(${userMfa.lastStep}, -1) < ${step}`))
      .returning({ userId: userMfa.userId });
    if (claimed.length === 0) return this.fail(userId);
    await this.rateLimiter.clear(`mfa:fail:${userId}`);
  }

  private async guardAttempts(userId: string): Promise<void> {
    const locked = await this.rateLimiter.peek(`mfa:fail:${userId}`);
    if (locked.count >= MAX_FAILURES) throw AppError.rateLimited(locked.retryAfterSeconds);
  }

  private async fail(userId: string): Promise<never> {
    await this.rateLimiter.hit(`mfa:fail:${userId}`, MAX_FAILURES, LOCK_SECONDS);
    throw mfaInvalid();
  }

  private async replaceRecoveryCodes(userId: string, codes: string[], tx: Executor): Promise<void> {
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
    await tx
      .insert(mfaRecoveryCodes)
      .values(codes.map((c) => ({ userId, codeHash: sha256(normalizeRecoveryCode(c)) })));
  }

  /** Removes the authenticator and recovery codes, and ends every session. */
  async remove(userId: string, tx: Executor): Promise<void> {
    await tx.delete(userMfa).where(eq(userMfa.userId, userId));
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
    await this.tokens.revokeAllForUser(userId, tx);
  }

  private record(
    action: AuditAction,
    actorUserId: string | null,
    userId: string,
    ctx: RequestContext,
    tx: Executor,
    newValue?: Record<string, unknown>,
  ) {
    return this.audit.record(
      {
        actorUserId,
        action,
        entityType: 'user',
        entityId: userId,
        newValue: newValue ?? null,
        requestId: ctx.requestId,
      },
      tx,
    );
  }
}
