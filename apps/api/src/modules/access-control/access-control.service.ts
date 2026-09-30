import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import type { Principal } from '../../common/auth/principal.js';
import { DB, type Database, type Executor } from '../../infrastructure/database/database.module.js';
import { users } from '../users/users.schema.js';
import {
  PERMISSION_DESCRIPTIONS,
  ROLE_DEFINITIONS,
  type Permission,
  type Role,
} from './access-control.catalog.js';
import { permissions, rolePermissions, roles, userRoles } from './access-control.schema.js';

@Injectable()
export class AccessControlService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Loads status, roles and effective permissions in one query. Null if the user does not exist. */
  async loadPrincipal(userId: string): Promise<Principal | null> {
    const rows = await this.db
      .select({
        status: users.status,
        role: userRoles.roleCode,
        permission: rolePermissions.permissionCode,
      })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .leftJoin(rolePermissions, eq(rolePermissions.roleCode, userRoles.roleCode))
      .where(eq(users.id, userId));

    const first = rows[0];
    if (!first) return null;
    const roleSet = new Set<string>();
    const permissionSet = new Set<string>();
    for (const row of rows) {
      if (row.role) roleSet.add(row.role);
      if (row.permission) permissionSet.add(row.permission);
    }
    return { userId, status: first.status, roles: [...roleSet].sort(), permissions: permissionSet };
  }

  async rolesOf(userId: string, db: Executor = this.db): Promise<string[]> {
    const rows = await db
      .select({ role: userRoles.roleCode })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    return rows.map((r) => r.role).sort();
  }

  /** Roles for many users at once (for lists). */
  async rolesOfMany(userIds: string[], db: Executor = this.db): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (userIds.length === 0) return result;
    const rows = await db
      .select({ userId: userRoles.userId, role: userRoles.roleCode })
      .from(userRoles)
      .where(inArray(userRoles.userId, userIds));
    for (const { userId, role } of rows) result.set(userId, [...(result.get(userId) ?? []), role].sort());
    return result;
  }

  async revokeAllRoles(userId: string, db: Executor = this.db): Promise<void> {
    await db.delete(userRoles).where(eq(userRoles.userId, userId));
  }

  /** Idempotent: granting a role the user already has is a no-op. Returns true if newly granted. */
  async grantRole(
    userId: string,
    role: Role,
    grantedBy: string | null,
    db: Executor = this.db,
  ): Promise<boolean> {
    const inserted = await db
      .insert(userRoles)
      .values({ userId, roleCode: role, grantedBy })
      .onConflictDoNothing()
      .returning({ userId: userRoles.userId });
    return inserted.length > 0;
  }

  /** Returns true if the role was removed. */
  async revokeRole(userId: string, role: Role, db: Executor = this.db): Promise<boolean> {
    const deleted = await db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleCode, role)))
      .returning({ userId: userRoles.userId });
    return deleted.length > 0;
  }

  /** Makes the database match access-control.catalog.ts exactly. Safe to run on every deploy. */
  async syncCatalog(): Promise<void> {
    const permissionCodes = Object.keys(PERMISSION_DESCRIPTIONS) as Permission[];
    const roleCodes = Object.keys(ROLE_DEFINITIONS) as Role[];

    await this.db.transaction(async (tx) => {
      for (const code of permissionCodes) {
        await tx
          .insert(permissions)
          .values({ code, description: PERMISSION_DESCRIPTIONS[code] })
          .onConflictDoUpdate({
            target: permissions.code,
            set: { description: PERMISSION_DESCRIPTIONS[code] },
          });
      }
      await tx.delete(permissions).where(notInArray(permissions.code, permissionCodes));

      for (const code of roleCodes) {
        const { name, description } = ROLE_DEFINITIONS[code];
        await tx
          .insert(roles)
          .values({ code, name, description })
          .onConflictDoUpdate({ target: roles.code, set: { name, description } });
      }

      await tx.delete(rolePermissions).where(inArray(rolePermissions.roleCode, roleCodes));
      const links = roleCodes.flatMap((roleCode) =>
        ROLE_DEFINITIONS[roleCode].permissions.map((permissionCode) => ({ roleCode, permissionCode })),
      );
      if (links.length > 0) await tx.insert(rolePermissions).values(links);
    });
  }
}
