import { jsonb, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { updatedAt } from '../../infrastructure/database/columns.js';
import { users } from '../users/users.schema.js';

/** Runtime-editable platform settings. Allowed keys and their shapes live in settings.registry.ts. */
export const platformSettings = pgTable('platform_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: updatedAt(),
});
