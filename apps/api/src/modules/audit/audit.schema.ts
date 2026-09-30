import { index, jsonb, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, idColumn } from '../../infrastructure/database/columns.js';
import { users } from '../users/users.schema.js';

/** Append-only record of important administrative and security events. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: idColumn(),
    /** Null when the system (e.g. a background job) performed the action. */
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: varchar('entity_id', { length: 64 }),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    requestId: varchar('request_id', { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_actor_idx').on(t.actorUserId),
    index('audit_logs_created_at_idx').on(t.createdAt),
  ],
);

export type AuditLogRow = typeof auditLogs.$inferSelect;
