import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, ne, or, type SQL } from 'drizzle-orm';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { offsetOf, Page, type PageQuery } from '../../common/http/pagination.js';
import { DB, type Database, type Executor } from '../../infrastructure/database/database.module.js';
import { isUniqueViolation } from '../../infrastructure/database/pg-errors.js';
import { Role, type Role as RoleCode } from '../access-control/access-control.catalog.js';
import { AccessControlService } from '../access-control/access-control.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { users, type UserRow } from './users.schema.js';

export interface UserView {
  id: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  status: UserRow['status'];
  roles: string[];
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface ProfileUpdate {
  name?: string;
  email?: string | null;
}

export interface UserListQuery extends PageQuery {
  search?: string;
  status?: UserRow['status'];
}

interface Actor {
  userId: string;
  requestId?: string;
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly accessControl: AccessControlService,
    private readonly audit: AuditService,
  ) {}

  async findByPhone(phone: string, db: Executor = this.db): Promise<UserRow | null> {
    const [row] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    return row ?? null;
  }

  /**
   * Returns the user for a verified phone, creating a CUSTOMER account on first login.
   * Must run inside the caller's transaction.
   */
  async findOrCreateByPhone(phone: string, tx: Executor): Promise<{ user: UserRow; created: boolean }> {
    const now = new Date();
    const [inserted] = await tx
      .insert(users)
      .values({ phone, phoneVerifiedAt: now })
      .onConflictDoNothing({ target: users.phone })
      .returning();
    if (inserted) {
      await this.accessControl.grantRole(inserted.id, Role.CUSTOMER, null, tx);
      await this.audit.record(
        {
          actorUserId: inserted.id,
          action: AuditAction.USER_REGISTERED,
          entityType: 'user',
          entityId: inserted.id,
        },
        tx,
      );
      return { user: inserted, created: true };
    }
    const existing = await this.findByPhone(phone, tx);
    if (!existing) throw new Error('User vanished between insert and select');
    return { user: existing, created: false };
  }

  async markLogin(userId: string, tx: Executor): Promise<void> {
    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  }

  async getView(userId: string, db: Executor = this.db): Promise<UserView> {
    const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!row || row.status === 'DELETED') throw AppError.notFound('User');
    return this.toView(row, await this.accessControl.rolesOf(userId, db));
  }

  async updateProfile(userId: string, update: ProfileUpdate): Promise<UserView> {
    try {
      await this.db
        .update(users)
        .set({
          ...(update.name !== undefined ? { name: update.name } : {}),
          ...(update.email !== undefined ? { email: update.email } : {}),
        })
        .where(and(eq(users.id, userId), ne(users.status, 'DELETED')));
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_key')) {
        throw AppError.conflict('This email address is already used by another account');
      }
      throw error;
    }
    return this.getView(userId);
  }

  /**
   * Account deletion (DPDP): personal data is erased, the row is kept (status DELETED) so
   * audit history and foreign keys stay intact. The phone can register again as a new account.
   */
  async anonymize(userId: string, tx: Executor): Promise<void> {
    const updated = await tx
      .update(users)
      .set({ phone: null, name: null, email: null, status: 'DELETED', deletedAt: new Date() })
      .where(and(eq(users.id, userId), ne(users.status, 'DELETED')))
      .returning({ id: users.id });
    if (updated.length === 0) throw AppError.notFound('User');
    await this.accessControl.revokeAllRoles(userId, tx);
  }

  // ---- Admin ------------------------------------------------------------------------------

  async list(query: UserListQuery): Promise<Page<UserView>> {
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(users.status, query.status));
    if (query.search) {
      const term = `%${escapeLike(query.search)}%`;
      const match = or(ilike(users.phone, term), ilike(users.name, term), ilike(users.email, term));
      if (match) filters.push(match);
    }
    const where = filters.length ? and(...filters) : undefined;

    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt), desc(users.id))
        .limit(query.pageSize)
        .offset(offsetOf(query)),
      this.db.select({ value: count() }).from(users).where(where),
    ]);

    const rolesByUser = await this.accessControl.rolesOfMany(rows.map((r) => r.id));
    return new Page(
      rows.map((row) => this.toView(row, rolesByUser.get(row.id) ?? [])),
      query,
      total?.value ?? 0,
    );
  }

  async setStatus(
    targetUserId: string,
    status: 'ACTIVE' | 'SUSPENDED',
    reason: string,
    actor: Actor,
  ): Promise<UserView> {
    if (targetUserId === actor.userId) throw AppError.forbidden('You cannot change your own account status');

    await this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(users).where(eq(users.id, targetUserId)).for('update');
      if (!current || current.status === 'DELETED') throw AppError.notFound('User');
      if (current.status === status) return;

      await tx.update(users).set({ status }).where(eq(users.id, targetUserId));
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: status === 'SUSPENDED' ? AuditAction.USER_SUSPENDED : AuditAction.USER_REACTIVATED,
          entityType: 'user',
          entityId: targetUserId,
          oldValue: { status: current.status },
          newValue: { status, reason },
          requestId: actor.requestId,
        },
        tx,
      );
    });
    return this.getView(targetUserId);
  }

  async grantRole(targetUserId: string, role: RoleCode, actor: Actor): Promise<UserView> {
    await this.db.transaction(async (tx) => {
      await this.assertAssignableTarget(targetUserId, tx);
      if (await this.accessControl.grantRole(targetUserId, role, actor.userId, tx)) {
        await this.audit.record(
          {
            actorUserId: actor.userId,
            action: AuditAction.ROLE_GRANTED,
            entityType: 'user',
            entityId: targetUserId,
            newValue: { role },
            requestId: actor.requestId,
          },
          tx,
        );
      }
    });
    return this.getView(targetUserId);
  }

  async revokeRole(targetUserId: string, role: RoleCode, actor: Actor): Promise<UserView> {
    if (targetUserId === actor.userId && role === Role.SUPER_ADMIN) {
      // Prevents the last super admin from locking everyone out by accident.
      throw AppError.forbidden('You cannot remove your own SUPER_ADMIN role');
    }
    await this.db.transaction(async (tx) => {
      await this.assertAssignableTarget(targetUserId, tx);
      if (await this.accessControl.revokeRole(targetUserId, role, tx)) {
        await this.audit.record(
          {
            actorUserId: actor.userId,
            action: AuditAction.ROLE_REVOKED,
            entityType: 'user',
            entityId: targetUserId,
            oldValue: { role },
            requestId: actor.requestId,
          },
          tx,
        );
      }
    });
    return this.getView(targetUserId);
  }

  private async assertAssignableTarget(userId: string, tx: Executor): Promise<void> {
    const [row] = await tx.select({ status: users.status }).from(users).where(eq(users.id, userId));
    if (!row || row.status === 'DELETED') throw AppError.notFound('User');
    if (row.status === 'SUSPENDED') {
      throw new AppError(
        ErrorCode.CONFLICT,
        HttpStatus.CONFLICT,
        'Reactivate the user before changing roles',
      );
    }
  }

  private toView(row: UserRow, roles: string[]): UserView {
    return {
      id: row.id,
      phone: row.phone,
      name: row.name,
      email: row.email,
      status: row.status,
      roles,
      createdAt: row.createdAt,
      lastLoginAt: row.lastLoginAt,
    };
  }
}
