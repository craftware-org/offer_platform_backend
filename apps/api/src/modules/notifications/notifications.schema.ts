import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, idColumn, timestamptz } from '../../infrastructure/database/columns.js';
import { users } from '../users/users.schema.js';
import { NOTIFICATION_TYPES } from './notification-catalog.js';

export const notificationType = pgEnum('notification_type', NOTIFICATION_TYPES);

/** Email outbox state of a notification (ADR-0016). NONE = inbox only. */
export const emailStatus = pgEnum('notification_email_status', ['NONE', 'PENDING', 'SENDING', 'SENT', 'FAILED']);

/** One message to one person: the inbox entry and, when chosen, the email outbox row. */
export const notifications = pgTable(
  'notifications',
  {
    id: idColumn(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationType('type').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: varchar('body', { length: 1000 }).notNull(),
    /** Website path to open, e.g. /offers/<slug> or /business/<id>. */
    link: varchar('link', { length: 300 }),
    /** Stops repeats, e.g. "offer-ending:<offerId>" (unique per user). */
    dedupeKey: varchar('dedupe_key', { length: 200 }),
    /** False when the person turned the inbox off for this type but kept email. */
    inApp: boolean('in_app').notNull().default(true),
    readAt: timestamptz('read_at'),
    emailStatus: emailStatus('email_status').notNull().default('NONE'),
    /** Quiet hours: customer emails wait until 08:00 India time. */
    emailNotBefore: timestamptz('email_not_before'),
    emailAttempts: smallint('email_attempts').notNull().default(0),
    emailSentAt: timestamptz('email_sent_at'),
    emailError: varchar('email_error', { length: 300 }),
    createdAt: createdAt(),
  },
  (t) => [
    index('notifications_user_created_idx').on(t.userId, t.createdAt),
    index('notifications_email_outbox_idx')
      .on(t.emailNotBefore)
      .where(sql`email_status = 'PENDING'`),
    uniqueIndex('notifications_user_dedupe_key').on(t.userId, t.dedupeKey),
  ],
);

/** Only the person's changes from the defaults are stored (see notification-catalog.ts). */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationType('type').notNull(),
    inApp: boolean('in_app').notNull(),
    email: boolean('email').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type] })],
);
