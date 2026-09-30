/**
 * Source of truth for roles and permissions. `pnpm db:seed` syncs this into the database.
 * Endpoints check PERMISSIONS, never role names, so roles can be reshaped without code changes.
 * Later phases add permissions here (e.g. offer:moderate).
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
  BUSINESSES_READ: 'businesses:read',
  BUSINESSES_VERIFY: 'businesses:verify',
  BUSINESSES_MANAGE: 'businesses:manage',
  CATEGORIES_MANAGE: 'categories:manage',
  LOCATIONS_MANAGE: 'locations:manage',
  SETTINGS_MANAGE: 'settings:manage',
  OFFERS_READ: 'offers:read',
  OFFERS_MODERATE: 'offers:moderate',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'users:read': 'View and search user accounts',
  'users:manage-status': 'Suspend and reactivate user accounts',
  'roles:assign': 'Grant and revoke administrative roles',
  'audit:read': 'View the audit log',
  'businesses:read': 'View all businesses, including private verification photos',
  'businesses:verify': 'Verify or reject businesses',
  'businesses:manage': 'Suspend/reactivate businesses and edit their locked details',
  'categories:manage': 'Create, edit, disable and reorder categories',
  'locations:manage': 'Manage cities and localities',
  'settings:manage': 'Change platform settings (e.g. verification requirements)',
  'offers:read': 'View all offers, including drafts and those under review',
  'offers:moderate': 'Approve, reject, request changes to, suspend and reactivate offers',
};

const ADMIN_PERMISSIONS: Permission[] = [
  Permission.USERS_READ,
  Permission.USERS_MANAGE_STATUS,
  Permission.AUDIT_READ,
  Permission.BUSINESSES_READ,
  Permission.BUSINESSES_VERIFY,
  Permission.BUSINESSES_MANAGE,
  Permission.CATEGORIES_MANAGE,
  Permission.LOCATIONS_MANAGE,
  Permission.OFFERS_READ,
  Permission.OFFERS_MODERATE,
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
    description: 'Full platform control, including administrator management and settings.',
    permissions: [...ADMIN_PERMISSIONS, Permission.ROLES_ASSIGN, Permission.SETTINGS_MANAGE],
  },
};

/** Roles that may be granted/revoked through the admin API. Business roles come from business flows. */
export const ADMIN_ASSIGNABLE_ROLES = [Role.ADMIN, Role.SUPER_ADMIN] as const;
