import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import { offsetOf, Page, type PageQuery } from '../../common/http/pagination.js';
import { DB, type Database, type Executor } from '../../infrastructure/database/database.module.js';
import { auditLogs, type AuditLogRow } from './audit.schema.js';

/** Audit action names. Add new ones here so they stay consistent and searchable. */
export const AuditAction = {
  USER_REGISTERED: 'USER_REGISTERED',
  USER_SUSPENDED: 'USER_SUSPENDED',
  USER_REACTIVATED: 'USER_REACTIVATED',
  USER_DELETED_ACCOUNT: 'USER_DELETED_ACCOUNT',
  UNVERIFIED_EMAIL_RELEASED: 'UNVERIFIED_EMAIL_RELEASED',
  ROLE_GRANTED: 'ROLE_GRANTED',
  ROLE_REVOKED: 'ROLE_REVOKED',
  REFRESH_TOKEN_REUSE_DETECTED: 'REFRESH_TOKEN_REUSE_DETECTED',
  BUSINESS_REGISTERED: 'BUSINESS_REGISTERED',
  BUSINESS_SUBMITTED_FOR_VERIFICATION: 'BUSINESS_SUBMITTED_FOR_VERIFICATION',
  BUSINESS_VERIFIED: 'BUSINESS_VERIFIED',
  BUSINESS_REJECTED: 'BUSINESS_REJECTED',
  BUSINESS_SUSPENDED: 'BUSINESS_SUSPENDED',
  BUSINESS_REACTIVATED: 'BUSINESS_REACTIVATED',
  BUSINESS_UPDATED_BY_ADMIN: 'BUSINESS_UPDATED_BY_ADMIN',
  CATEGORY_CREATED: 'CATEGORY_CREATED',
  CATEGORY_CHANGED: 'CATEGORY_CHANGED',
  CATEGORIES_REORDERED: 'CATEGORIES_REORDERED',
  CITY_CREATED: 'CITY_CREATED',
  CITY_CHANGED: 'CITY_CHANGED',
  LOCALITY_CREATED: 'LOCALITY_CREATED',
  LOCALITY_CHANGED: 'LOCALITY_CHANGED',
  SYSTEM_SETTING_CHANGED: 'SYSTEM_SETTING_CHANGED',
  OFFER_CREATED: 'OFFER_CREATED',
  OFFER_SUBMITTED: 'OFFER_SUBMITTED',
  OFFER_WITHDRAWN: 'OFFER_WITHDRAWN',
  OFFER_EDITED_LIVE: 'OFFER_EDITED_LIVE',
  OFFER_PAUSED: 'OFFER_PAUSED',
  OFFER_RESUMED: 'OFFER_RESUMED',
  OFFER_ENDED: 'OFFER_ENDED',
  OFFER_DELETED: 'OFFER_DELETED',
  OFFER_APPROVED: 'OFFER_APPROVED',
  OFFER_REJECTED: 'OFFER_REJECTED',
  OFFER_CHANGES_REQUESTED: 'OFFER_CHANGES_REQUESTED',
  OFFER_SUSPENDED: 'OFFER_SUSPENDED',
  OFFER_REACTIVATED: 'OFFER_REACTIVATED',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditEntry {
  actorUserId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  requestId?: string;
}

export interface AuditQuery extends PageQuery {
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  action?: string;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Pass the open transaction so the audit row commits or rolls back with the change it describes. */
  async record(entry: AuditEntry, db: Executor = this.db): Promise<void> {
    await db.insert(auditLogs).values({
      actorUserId: entry.actorUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
      requestId: entry.requestId ?? null,
    });
  }

  async list(query: AuditQuery): Promise<Page<AuditLogRow>> {
    const filters: SQL[] = [];
    if (query.entityType) filters.push(eq(auditLogs.entityType, query.entityType));
    if (query.entityId) filters.push(eq(auditLogs.entityId, query.entityId));
    if (query.actorUserId) filters.push(eq(auditLogs.actorUserId, query.actorUserId));
    if (query.action) filters.push(eq(auditLogs.action, query.action));
    const where = filters.length ? and(...filters) : undefined;

    const [items, [total]] = await Promise.all([
      this.db
        .select()
        .from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(query.pageSize)
        .offset(offsetOf(query)),
      this.db.select({ value: count() }).from(auditLogs).where(where),
    ]);
    return new Page(items, query, total?.value ?? 0);
  }
}
