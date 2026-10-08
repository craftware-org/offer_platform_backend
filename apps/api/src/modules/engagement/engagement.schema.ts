import { index, pgEnum, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { createdAt, idColumn } from '../../infrastructure/database/columns.js';
import { businesses } from '../businesses/businesses.schema.js';
import { offers } from '../offers/offers.schema.js';
import { users } from '../users/users.schema.js';

/** Offers a customer saved (spec §23). One row per user and offer. */
export const savedOffers = pgTable(
  'saved_offers',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id, { onDelete: 'cascade' }),
    /** Copied from the offer so per-business counts need no join into the offers module. */
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.offerId] }),
    index('saved_offers_offer_idx').on(t.offerId),
    index('saved_offers_business_idx').on(t.businessId),
  ],
);

/** Businesses a customer follows (spec §24). */
export const businessFollowers = pgTable(
  'business_followers',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.businessId] }), index('business_followers_business_idx').on(t.businessId)],
);

/**
 * Engagement events (spec §30). Phase 5 records the logged-in user's shares and contact taps
 * (owner decision 2026-10-03: only logged-in users are counted) plus saves and follows.
 * The full list from the spec is declared now so Phase 7 needs no enum migration.
 * Privacy: no location, IP or device data is ever stored here.
 */
export const analyticsEventType = pgEnum('analytics_event_type', [
  'OFFER_VIEWED',
  'OFFER_SAVED',
  'OFFER_SHARED',
  'BUSINESS_VIEWED',
  'BUSINESS_FOLLOWED',
  'CALL_CLICKED',
  'WHATSAPP_CLICKED',
  'WEBSITE_CLICKED',
  'DIRECTIONS_CLICKED',
  'OFFER_REPORTED',
  'SEARCH_PERFORMED',
  'CATEGORY_VIEWED',
]);
export type AnalyticsEventType = (typeof analyticsEventType.enumValues)[number];

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: idColumn(),
    type: analyticsEventType('type').notNull(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    offerId: uuid('offer_id').references(() => offers.id, { onDelete: 'cascade' }),
    /** Who acted; kept null-able so deleting an account never deletes the counts. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('analytics_events_business_type_idx').on(t.businessId, t.type),
    index('analytics_events_offer_type_idx').on(t.offerId, t.type),
    index('analytics_events_created_idx').on(t.createdAt),
  ],
);
