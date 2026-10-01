import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';
import { DB, type Database } from '../../infrastructure/database/database.module.js';
import { AccessControlService } from '../access-control/access-control.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { UsersService, type UserView } from '../users/users.service.js';
import { OtpService, type OtpTarget } from './otp.service.js';
import { normalizePhone } from '../../common/phone/phone.js';
import { invalidRefreshToken, TokenService, type TokenPair } from './token.service.js';

export const accountSuspended = () =>
  new AppError(
    ErrorCode.ACCOUNT_SUSPENDED,
    HttpStatus.FORBIDDEN,
    'This account is suspended. Please contact support.',
  );

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

/** One-time-code login by phone or email: one flow for registration and sign-in (ADR-0006, ADR-0013). */
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
