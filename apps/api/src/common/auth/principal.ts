import type { Request } from 'express';
import type { UserStatus } from '../../modules/users/users.schema.js';

/** The authenticated caller, loaded fresh from the database on every request. */
export interface Principal {
  userId: string;
  status: UserStatus;
  roles: string[];
  permissions: ReadonlySet<string>;
}

/** `id` is assigned by requestIdMiddleware before anything else runs. */
export type AuthenticatedRequest = Request & { principal?: Principal; id?: string };
