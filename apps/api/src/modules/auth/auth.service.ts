import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';
import { DB, type Database, type Executor } from '../../infrastructure/database/database.module.js';
import { RateLimiterService } from '../../infrastructure/redis/rate-limiter.service.js';
import { AccessControlService } from '../access-control/access-control.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { UserRow } from '../users/users.schema.js';
import { UsersService, type UserView } from '../users/users.service.js';
import { dummyHash, hashPassword, verifyPassword } from './password-hasher.js';
import { passwordProblem } from './password-policy.js';
import { OtpService, type OtpTarget } from './otp.service.js';
import { normalizePhone } from '../../common/phone/phone.js';
import { invalidRefreshToken, TokenService, type TokenPair } from './token.service.js';

export const accountSuspended = () =>
  new AppError(
    ErrorCode.ACCOUNT_SUSPENDED,
    HttpStatus.FORBIDDEN,
    'This account is suspended. Please contact support.',
  );

export const invalidCredentials = () =>
  new AppError(
    ErrorCode.INVALID_CREDENTIALS,
    HttpStatus.UNAUTHORIZED,
    'Wrong email/phone or password. You can also log in with a code.',
  );

/** Wrong passwords allowed per account (and per IP, more generously) before a temporary lock. */
const PASSWORD_MAX_FAILURES = 5;
const PASSWORD_MAX_TRIES_PER_IP = 30;
const PASSWORD_LOCK_SECONDS = 15 * 60;

export interface LoginResult extends TokenPair {
  isNewUser: boolean;
  user: UserView;
}

interface RequestContext {
  userAgent?: string;
  requestId?: string;
}

/** Log in with a code sent to a phone (SMS) or to an email address. */
export type LoginIdentity = { phone: string } | { email: string };

/**
 * Login by phone or email: one-time code (registration and sign-in, ADR-0006/0013) or, once set,
 * a password (ADR-0015). Forgot password = prove the phone/email with a code, then set a new one.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly accessControl: AccessControlService,
    private readonly audit: AuditService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async requestOtp(identity: LoginIdentity, clientIp: string) {
    // The response is identical for new and existing accounts, so it reveals nothing about them.
    return this.otp.request(this.target(identity), clientIp);
  }

  async verifyOtp(identity: LoginIdentity, code: string, ctx: RequestContext): Promise<LoginResult> {
    const target = this.target(identity);
    await this.otp.verify(target.destination, code);

    const { user, created, tokens } = await this.db.transaction(async (tx) => {
      const found =
        target.channel === 'SMS'
          ? await this.users.findOrCreateByPhone(target.destination, tx)
          : await this.users.findOrCreateByVerifiedEmail(target.destination, tx);
      if (found.user.status === 'SUSPENDED') throw accountSuspended();
      await this.users.markLogin(found.user.id, tx);
      return { ...found, tokens: await this.tokens.issue(found.user.id, ctx.userAgent, tx) };
    });
    return { ...tokens, isNewUser: created, user: await this.users.getView(user.id) };
  }

  // ---- Passwords (ADR-0015) ------------------------------------------------------------------

  /**
   * Email or phone + password. One generic error for "no account", "no password yet" and "wrong
   * password", with the same hashing cost, so the response reveals nothing about accounts.
   * After PASSWORD_MAX_FAILURES wrong tries an account is locked for PASSWORD_LOCK_SECONDS.
   */
  async passwordLogin(
    identity: LoginIdentity,
    password: string,
    clientIp: string,
    ctx: RequestContext,
  ): Promise<LoginResult> {
    const target = this.target(identity);
    await this.rateLimiter.consume(`pwd:ip:${clientIp}`, PASSWORD_MAX_TRIES_PER_IP, PASSWORD_LOCK_SECONDS);
    const failKey = `pwd:fail:${target.destination}`;
    const locked = await this.rateLimiter.peek(failKey);
    if (locked.count >= PASSWORD_MAX_FAILURES) throw AppError.rateLimited(locked.retryAfterSeconds);

    const user = await this.users.findForPasswordLogin(
      target.channel === 'SMS' ? { phone: target.destination } : { email: target.destination },
    );
    let ok = false;
    if (user?.passwordHash) ok = await verifyPassword(user.passwordHash, password);
    else await verifyPassword(await dummyHash(), password); // same cost as a real check
    if (!user || !ok) {
      await this.rateLimiter.hit(failKey, PASSWORD_MAX_FAILURES, PASSWORD_LOCK_SECONDS);
      throw invalidCredentials();
    }
    await this.rateLimiter.clear(failKey);
    if (user.status === 'SUSPENDED') throw accountSuspended();

    const tokens = await this.db.transaction(async (tx) => {
      await this.users.markLogin(user.id, tx);
      return this.tokens.issue(user.id, ctx.userAgent, tx);
    });
    return { ...tokens, isNewUser: false, user: await this.users.getView(user.id) };
  }

  /** First password for an account that logged in with a code. Changing an existing one needs the current password. */
  async setInitialPassword(userId: string, password: string, ctx: RequestContext): Promise<UserView> {
    const user = await this.users.getRow(userId);
    if (user.passwordHash) {
      throw AppError.conflict('A password is already set. Use change password, or reset it with a code.');
    }
    const hash = await this.hashChecked(password, user);
    await this.db.transaction(async (tx) => {
      await this.users.setPasswordHash(userId, hash, tx);
      await this.recordPassword(AuditAction.PASSWORD_SET, userId, ctx, tx);
    });
    return this.users.getView(userId);
  }

  /** Requires the current password. Ends every session and returns fresh tokens for this device. */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ctx: RequestContext,
  ): Promise<TokenPair> {
    const user = await this.users.getRow(userId);
    const failKey = `pwd:fail:user:${userId}`;
    const locked = await this.rateLimiter.peek(failKey);
    if (locked.count >= PASSWORD_MAX_FAILURES) throw AppError.rateLimited(locked.retryAfterSeconds);
    if (!user.passwordHash || !(await verifyPassword(user.passwordHash, currentPassword))) {
      await this.rateLimiter.hit(failKey, PASSWORD_MAX_FAILURES, PASSWORD_LOCK_SECONDS);
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED, 'The current password is not correct', {
        currentPassword: 'Not correct',
      });
    }
    await this.rateLimiter.clear(failKey);
    const hash = await this.hashChecked(newPassword, user, 'newPassword');
    return this.db.transaction(async (tx) => {
      await this.users.setPasswordHash(userId, hash, tx);
      await this.tokens.revokeAllForUser(userId, tx);
      await this.recordPassword(AuditAction.PASSWORD_CHANGED, userId, ctx, tx);
      return this.tokens.issue(userId, ctx.userAgent, tx);
    });
  }

  /**
   * Forgot password: prove control of the phone/email with a code (same limits as code login),
   * then set a new password. Ends every session. Like code login, a first-time identity gets an
   * account, so the response never reveals whether one existed.
   */
  async resetPassword(
    identity: LoginIdentity,
    code: string,
    newPassword: string,
    ctx: RequestContext,
  ): Promise<LoginResult> {
    const target = this.target(identity);
    const policy = passwordProblem(newPassword, [target.destination]);
    if (policy) throw AppError.validation({ newPassword: policy });
    await this.otp.verify(target.destination, code);
    const hash = await hashPassword(newPassword);

    const { user, created, tokens } = await this.db.transaction(async (tx) => {
      const found =
        target.channel === 'SMS'
          ? await this.users.findOrCreateByPhone(target.destination, tx)
          : await this.users.findOrCreateByVerifiedEmail(target.destination, tx);
      if (found.user.status === 'SUSPENDED') throw accountSuspended();
      await this.users.setPasswordHash(found.user.id, hash, tx);
      await this.tokens.revokeAllForUser(found.user.id, tx);
      await this.recordPassword(AuditAction.PASSWORD_RESET, found.user.id, ctx, tx);
      await this.users.markLogin(found.user.id, tx);
      return { ...found, tokens: await this.tokens.issue(found.user.id, ctx.userAgent, tx) };
    });
    await this.rateLimiter.clear(`pwd:fail:${target.destination}`);
    return { ...tokens, isNewUser: created, user: await this.users.getView(user.id) };
  }

  private async hashChecked(password: string, user: UserRow, field = 'password'): Promise<string> {
    const policy = passwordProblem(password, [user.email, user.phone]);
    if (policy) throw AppError.validation({ [field]: policy });
    return hashPassword(password);
  }

  private recordPassword(action: AuditAction, userId: string, ctx: RequestContext, tx: Executor) {
    return this.audit.record(
      { actorUserId: userId, action, entityType: 'user', entityId: userId, requestId: ctx.requestId },
      tx,
    );
  }

  private target(identity: LoginIdentity): OtpTarget {
    return 'phone' in identity
      ? { channel: 'SMS', destination: normalizePhone(identity.phone, this.config.DEFAULT_PHONE_COUNTRY) }
      : { channel: 'EMAIL', destination: identity.email.trim().toLowerCase() };
  }

  async refresh(refreshToken: string, ctx: RequestContext): Promise<TokenPair> {
    const userId = await this.tokens.ownerOf(refreshToken);
    if (!userId) throw invalidRefreshToken();
    const principal = await this.accessControl.loadPrincipal(userId);
    if (!principal || principal.status === 'DELETED') throw invalidRefreshToken();
    if (principal.status === 'SUSPENDED') throw accountSuspended();

    const outcome = await this.tokens.rotate(refreshToken, ctx.userAgent);
    if (outcome.kind === 'rotated') return outcome.tokens;
    if (outcome.kind === 'reused') {
      await this.tokens.revokeFamily(outcome.familyId);
      await this.audit.record({
        actorUserId: null,
        action: AuditAction.REFRESH_TOKEN_REUSE_DETECTED,
        entityType: 'user',
        entityId: outcome.userId,
        newValue: { familyId: outcome.familyId },
        requestId: ctx.requestId,
      });
    }
    throw invalidRefreshToken();
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revokeSessionOf(refreshToken);
  }

  /** Erases personal data and ends every session (DPDP right to erasure). */
  async deleteAccount(userId: string, ctx: RequestContext): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.users.anonymize(userId, tx);
      await this.tokens.revokeAllForUser(userId, tx);
      await this.audit.record(
        {
          actorUserId: userId,
          action: AuditAction.USER_DELETED_ACCOUNT,
          entityType: 'user',
          entityId: userId,
          requestId: ctx.requestId,
        },
        tx,
      );
    });
  }
}
