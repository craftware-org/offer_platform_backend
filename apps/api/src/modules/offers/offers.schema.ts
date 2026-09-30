import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, idColumn, timestamptz, updatedAt } from '../../infrastructure/database/columns.js';
import { businesses } from '../businesses/businesses.schema.js';
import { categories } from '../categories/categories.schema.js';
import { users } from '../users/users.schema.js';
import { OFFER_TYPES } from './pricing.js';

export const offerType = pgEnum('offer_type', OFFER_TYPES);

/** APPROVED is an event (audit log), not a resting state: approval moves an offer to SCHEDULED or ACTIVE. */
export const offerStatus = pgEnum('offer_status', [
  'DRAFT',
  'PENDING_REVIEW',
  'REJECTED',
  'SCHEDULED',
  'ACTIVE',
  'PAUSED',
  'EXPIRED',
  'SUSPENDED',
]);
export type OfferStatus = (typeof offerStatus.enumValues)[number];

const paise = (name: string) => bigint(name, { mode: 'number' });

export const offers = pgTable(
  'offers',
  {
    id: idColumn(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    slug: varchar('slug', { length: 100 }).notNull(),
    type: offerType('type').notNull(),
    title: varchar('title', { length: 120 }).notNull(),
    description: varchar('description', { length: 2000 }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),

    // Pricing (integer paise). Fields that do not apply to the type are null.
    currency: char('currency', { length: 3 }).notNull().default('INR'),
    originalPrice: paise('original_price'),
    offerPrice: paise('offer_price'),
    /** Computed server-side for price-based offers; stated for PERCENTAGE_OFF. */
    discountPercent: numeric('discount_percent', { precision: 4, scale: 1, mode: 'number' }),
    isUpTo: boolean('is_up_to').notNull().default(false),
    maxDiscountAmount: paise('max_discount_amount'),
    flatAmountOff: paise('flat_amount_off'),
    minPurchaseAmount: paise('min_purchase_amount'),
    buyQuantity: smallint('buy_quantity'),
    getQuantity: smallint('get_quantity'),
    itemName: varchar('item_name', { length: 120 }),
    comboItems: jsonb('combo_items').$type<string[]>(),

    startsAt: timestamptz('starts_at').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
    terms: varchar('terms', { length: 2000 }),
    eligibility: varchar('eligibility', { length: 500 }),
    /** Informational, e.g. "first 50 customers" (redemption tracking is V2). */
    quantityLimit: integer('quantity_limit'),

    status: offerStatus('status').notNull().default('DRAFT'),
    /** Rejection reason, requested changes, or suspension reason (shown to the business). */
    statusReason: varchar('status_reason', { length: 1000 }),
    submittedAt: timestamptz('submitted_at'),
    approvedAt: timestamptz('approved_at'),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    /** First time the offer went public; after this the slug never changes. */
    firstPublishedAt: timestamptz('first_published_at'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('offers_slug_key').on(t.slug),
    index('offers_business_id_idx').on(t.businessId),
    index('offers_category_id_idx').on(t.categoryId),
    index('offers_status_expires_at_idx').on(t.status, t.expiresAt),
    index('offers_status_starts_at_idx').on(t.status, t.startsAt),
    // Defence in depth: the database itself refuses impossible pricing and dates.
    check(
      'offers_money_non_negative',
      sql`coalesce(${t.originalPrice}, 0) >= 0 and coalesce(${t.offerPrice}, 0) >= 0
        and coalesce(${t.flatAmountOff}, 0) >= 0 and coalesce(${t.minPurchaseAmount}, 0) >= 0
        and coalesce(${t.maxDiscountAmount}, 0) >= 0`,
    ),
    check(
      'offers_offer_price_below_original',
      sql`${t.originalPrice} is null or ${t.offerPrice} is null or ${t.offerPrice} < ${t.originalPrice}`,
    ),
    check(
      'offers_discount_range',
      sql`${t.discountPercent} is null or ${t.discountPercent} between 0 and 100`,
    ),
    check('offers_dates_valid', sql`${t.startsAt} < ${t.expiresAt}`),
  ],
);

export const offerImages = pgTable(
  'offer_images',
  {
    id: idColumn(),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id, { onDelete: 'cascade' }),
    storagePrefix: varchar('storage_prefix', { length: 200 }).notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bytes: integer('bytes').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('offer_images_offer_id_idx').on(t.offerId)],
);

export const priceChangeSource = pgEnum('price_change_source', ['CREATED', 'UPDATED_BY_BUSINESS']);

/** Every pricing change of an offer, for transparency and compliance (spec §16). Append-only. */
export const offerPriceHistory = pgTable(
  'offer_price_history',
  {
    id: idColumn(),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id, { onDelete: 'cascade' }),
    /** The offer price in paise (null for offer types without a single price). */
    price: paise('price'),
    originalPrice: paise('original_price'),
    discountPercent: numeric('discount_percent', { precision: 4, scale: 1, mode: 'number' }),
    /** Full pricing snapshot, covering every offer type. */
    pricing: jsonb('pricing').notNull(),
    source: priceChangeSource('source').notNull(),
    changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
    recordedAt: createdAt(),
  },
  (t) => [index('offer_price_history_offer_id_idx').on(t.offerId, t.recordedAt)],
);

export type OfferRow = typeof offers.$inferSelect;
export type OfferImageRow = typeof offerImages.$inferSelect;
export type OfferPriceHistoryRow = typeof offerPriceHistory.$inferSelect;
