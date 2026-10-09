import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, OPTIONAL_AUTH_KEY, PERMISSIONS_KEY } from '../../common/auth/decorators.js';
import type { AuthenticatedRequest } from '../../common/auth/principal.js';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';
import { RateLimiterService } from '../../infrastructure/redis/rate-limiter.service.js';
import { AccessControlService } from '../access-control/access-control.service.js';
import { accountSuspended } from './auth.service.js';
import { MfaService } from './mfa.service.js';
import { TokenService } from './token.service.js';

/** 1st guard: per-IP request budget across all instances. */
@Injectable()
export class IpRateLimitGuard implements CanActivate {
  constructor(
    private readonly rateLimiter: RateLimiterService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    await this.rateLimiter.consume(`ip:${req.ip ?? 'unknown'}`, this.config.RATE_LIMIT_PER_IP_PER_MINUTE, 60);
    return true;
  }
}

/**
 * 2nd guard: every endpoint requires a valid access token unless marked @Public().
 * @OptionalAuth() endpoints are public but still recognise a valid token.
 * The user is re-loaded on each request, so suspension and role changes apply immediately.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly accessControl: AccessControlService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (isPublic) {
      if (
        this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH_KEY, [
          context.getHandler(),
          context.getClass(),
        ])
      ) {
        req.principal = await this.tryPrincipal(req);
      }
      return true;
    }

    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw AppError.unauthenticated();

    const payload = await this.tokens.verifyAccessToken(token);
    if (!payload) throw AppError.unauthenticated('Invalid or expired access token');

    const principal = await this.accessControl.loadPrincipal(payload.sub);
    if (!principal || principal.status === 'DELETED')
      throw AppError.unauthenticated('Invalid or expired access token');
    if (principal.status === 'SUSPENDED') throw accountSuspended();

    req.principal = { ...principal, mfa: payload.mfa === true };
    return true;
  }

  private async tryPrincipal(req: AuthenticatedRequest) {
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) return undefined;
    const payload = await this.tokens.verifyAccessToken(token);
    if (!payload) return undefined;
    const principal = await this.accessControl.loadPrincipal(payload.sub);
    return principal?.status === 'ACTIVE' ? { ...principal, mfa: payload.mfa === true } : undefined;
  }
}

/**
 * 3rd guard: enforces @RequirePermissions(...) on the backend. Every permission is an admin one, so
 * the session must also have passed the authenticator step (owner decision 2026-10-09, ADR-0018).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly mfa: MfaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
    if (!principal) throw AppError.unauthenticated();
    if (!required.every((p) => principal.permissions.has(p))) throw AppError.forbidden();
    // Checked against the database too, so resetting or turning off someone's authenticator ends
    // their admin access at once, not when their 15-minute access token expires.
    const enrolled = await this.mfa.isEnabled(principal.userId);
    if (!principal.mfa || !enrolled) {
      throw enrolled
        ? new AppError(
            ErrorCode.MFA_REQUIRED,
            HttpStatus.FORBIDDEN,
            'Log in again with your authenticator code to use the admin area.',
          )
        : new AppError(
            ErrorCode.MFA_SETUP_REQUIRED,
            HttpStatus.FORBIDDEN,
            'Set up 2-step login with an authenticator app (Account page) to use the admin area.',
          );
    }
    return true;
  }
}
