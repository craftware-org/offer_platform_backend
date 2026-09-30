/**
 * Source of truth for roles and permissions. `pnpm db:seed` syncs this into the database.
 * Endpoints check PERMISSIONS, never role names, so roles can be reshaped without code changes.
 * Later phases add permissions here (e.g. business:verify, offer:moderate).
 */
export const Role = {
  CUSTOMER: 'CUSTOMER',
  BUSINESS_OWNER: 'BUSINESS_OWNER',
  BUSINESS_STAFF: 'BUSINESS_STAFF',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const Permission = {
  USERS_READ: 'users:read',
  USERS_MANAGE_STATUS: 'users:manage-status',
  ROLES_ASSIGN: 'roles:assign',
  AUDIT_READ: 'audit:read',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'users:read': 'View and search user accounts',
  'users:manage-status': 'Suspend and reactivate user accounts',
  'roles:assign': 'Grant and revoke administrative roles',
  'audit:read': 'View the audit log',
};

const ADMIN_PERMISSIONS: Permission[] = [
  Permission.USERS_READ,
  Permission.USERS_MANAGE_STATUS,
  Permission.AUDIT_READ,
];

export const ROLE_DEFINITIONS: Record<
  Role,
  { name: string; description: string; permissions: Permission[] }
> = {
  CUSTOMER: {
    name: 'Customer',
    description: 'Discovers, saves and shares offers. Granted to every registered user.',
    permissions: [],
  },
  BUSINESS_OWNER: {
    name: 'Business owner',
    description: 'Owns one or more businesses. Access is further scoped per business.',
    permissions: [],
  },
  BUSINESS_STAFF: {
    name: 'Business staff',
    description: 'Helps manage a business. Access is further scoped per business.',
    permissions: [],
  },
  ADMIN: {
    name: 'Admin',
    description: 'Platform moderation and support.',
    permissions: ADMIN_PERMISSIONS,
  },
  SUPER_ADMIN: {
    name: 'Super admin',
    description: 'Full platform control, including administrator management.',
    permissions: [...ADMIN_PERMISSIONS, Permission.ROLES_ASSIGN],
  },
};

/** Roles that may be granted/revoked through the admin API. Business roles come from business flows. */
export const ADMIN_ASSIGNABLE_ROLES = [Role.ADMIN, Role.SUPER_ADMIN] as const;
