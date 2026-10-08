import { date, index, integer, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, idColumn } from '../../infrastructure/database/columns.js';
import { businesses } from '../businesses/businesses.schema.js';
import { analyticsEventType } from '../engagement/engagement.schema.js';
import { cities } from '../locations/locations.schema.js';
import { offers } from '../offers/offers.schema.js';

/**
 * Daily totals of `analytics_events` (ADR-0017): one row per India-time day, business, offer
 * (null = the shop page itself) and event type. Written by the nightly worker job (rebuilt for the
 * last two days, so re-running it is harmless) and kept forever; raw events are kept 180 days.
 * No personal data.
 */
export const analyticsDaily = pgTable(
  'analytics_daily',
  {
    day: date('day', { mode: 'string' }).notNull(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    offerId: uuid('offer_id').references(() => offers.id, { onDelete: 'cascade' }),
    type: analyticsEventType('type').notNull(),
    count: integer('count').notNull(),
  },
  (t) => [
    index('analytics_daily_business_day_idx').on(t.businessId, t.day),
    index('analytics_daily_day_idx').on(t.day),
  ],
);

/**
 * What people search for (owner decision 2026-10-08): the normalized words, the city and how many
 * offers matched. No user, location, IP or device. Digit runs that could be phone numbers are
 * masked before saving. Kept 180 days.
 */
export const searchLogs = pgTable(
  'search_logs',
  {
    id: idColumn(),
    query: varchar('query', { length: 100 }).notNull(),
    cityId: uuid('city_id').references(() => cities.id, { onDelete: 'set null' }),
    results: integer('results').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('search_logs_created_idx').on(t.createdAt), index('search_logs_query_idx').on(t.query)],
);
