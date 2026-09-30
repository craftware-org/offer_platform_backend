import {
  boolean,
  index,
  integer,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { createdAt, idColumn, updatedAt } from '../../infrastructure/database/columns.js';

/** Admin-managed category tree, two levels: category → subcategory (e.g. Shopping → Fashion). */
export const categories = pgTable(
  'categories',
  {
    id: idColumn(),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 80 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    description: varchar('description', { length: 300 }),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('categories_slug_key').on(t.slug), index('categories_parent_id_idx').on(t.parentId)],
);

export type CategoryRow = typeof categories.$inferSelect;
