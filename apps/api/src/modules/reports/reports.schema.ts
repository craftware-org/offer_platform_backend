import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, idColumn, timestamptz } from '../../infrastructure/database/columns.js';
import { businesses } from '../businesses/businesses.schema.js';
import { offers } from '../offers/offers.schema.js';
import { users } from '../users/users.schema.js';

/** Report reasons, exactly as in the product specification (§27). */
export const reportReason = pgEnum('report_reason', [
  'OFFER_UNAVAILABLE',
  'WRONG_DISCOUNT',
  'MISLEADING_INFORMATION',
  'BUSINESS_CLOSED',
  'WRONG_LOCATION',
  'OFFENSIVE_CONTENT',
  'SUSPICIOUS_ACTIVITY',
  'OTHER',
]);
export type ReportReason = (typeof reportReason.enumValues)[number];

export const reportStatus = pgEnum('report_status', ['OPEN', 'RESOLVED', 'DISMISSED']);
export type ReportStatus = (typeof reportStatus.enumValues)[number];

/** What an admin did (owner decision 2026-10-03: all four are available). */
export const reportActionType = pgEnum('report_action_type', [
  'DISMISS',
  'WARN_BUSINESS',
  'SUSPEND_OFFER',
  'SUSPEND_BUSINESS',
]);
export type ReportActionType = (typeof reportActionType.enumValues)[number];

/** A customer's report about an offer (logged-in users only). */
export const reports = pgTable(
  'reports',
  {
    id: idColumn(),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id, { onDelete: 'restrict' }),
    /** Copied from the offer for the admin queue and business warnings. */
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    reporterUserId: uuid('reporter_user_id').references(() => users.id, { onDelete: 'set null' }),
    reason: reportReason('reason').notNull(),
    note: varchar('note', { length: 1000 }),
    status: reportStatus('status').notNull().default('OPEN'),
    resolvedAt: timestamptz('resolved_at'),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('reports_status_created_idx').on(t.status, t.createdAt),
    index('reports_offer_idx').on(t.offerId),
    index('reports_business_idx').on(t.businessId),
    // One open report per person per offer (spam control).
    uniqueIndex('reports_one_open_per_reporter_key')
      .on(t.offerId, t.reporterUserId)
      .where(sql`status = 'OPEN'`),
  ],
);

/** Every admin decision on a report (spec §27). A warning's message is what the business sees. */
export const reportActions = pgTable(
  'report_actions',
  {
    id: idColumn(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: reportActionType('action').notNull(),
    note: varchar('note', { length: 1000 }),
    createdAt: createdAt(),
  },
  (t) => [index('report_actions_report_idx').on(t.reportId)],
);
