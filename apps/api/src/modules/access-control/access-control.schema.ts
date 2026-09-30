import { pgTable, primaryKey, text, uuid, varchar, index } from 'drizzle-orm/pg-core';
import { createdAt } from '../../infrastructure/database/columns.js';
import { users } from '../users/users.schema.js';

/** Roles and permissions are reference data synced from access-control.catalog.ts. */
export const roles = pgTable('roles', {
  code: varchar('code', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description').notNull(),
  createdAt: createdAt(),
});

export const permissions = pgTable('permissions', {
  code: varchar('code', { length: 100 }).primaryKey(),
  description: text('description').notNull(),
  createdAt: createdAt(),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleCode: varchar('role_code', { length: 50 })
      .notNull()
      .references(() => roles.code, { onDelete: 'cascade' }),
    permissionCode: varchar('permission_code', { length: 100 })
      .notNull()
      .references(() => permissions.code, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleCode, t.permissionCode] })],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleCode: varchar('role_code', { length: 50 })
      .notNull()
      .references(() => roles.code, { onDelete: 'restrict' }),
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleCode] }), index('user_roles_role_code_idx').on(t.roleCode)],
);
