import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '../../modules/access-control/access-control.catalog.js';
import { AppError } from '../errors/app-error.js';
import type { AuthenticatedRequest, Principal } from './principal.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const PERMISSIONS_KEY = 'auth:permissions';

/** Endpoints require authentication by default. Mark the exceptions explicitly. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Caller must hold every listed permission. */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentPrincipal = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => {
  const principal = ctx.switchToHttp().getRequest<AuthenticatedRequest>().principal;
  if (!principal) throw AppError.unauthenticated();
  return principal;
});

export function requestIdOf(req: AuthenticatedRequest): string | undefined {
  return req.id;
}

export const RequestId = createParamDecorator((_: unknown, ctx: ExecutionContext) =>
  requestIdOf(ctx.switchToHttp().getRequest<AuthenticatedRequest>()),
);
