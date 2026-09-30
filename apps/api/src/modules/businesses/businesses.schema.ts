import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, idColumn, timestamptz, updatedAt } from '../../infrastructure/database/columns.js';
import { geographyPoint } from '../../infrastructure/database/postgis.js';
import { categories } from '../categories/categories.schema.js';
import { cities, localities } from '../locations/locations.schema.js';
import { users } from '../users/users.schema.js';

export const businessStatus = pgEnum('business_status', [
  'PENDING',
  'UNDER_REVIEW',
  'VERIFIED',
  'REJECTED',
  'SUSPENDED',
]);
export type BusinessStatus = (typeof businessStatus.enumValues)[number];

export const businessStaffRole = pgEnum('business_staff_role', ['OWNER', 'STAFF']);

export const businessImageKind = pgEnum('business_image_kind', [
  'LOGO',
  'GALLERY',
  'VERIFICATION_SHOP',
  'VERIFICATION_OWNER',
]);
export type BusinessImageKind = (typeof businessImageKind.enumValues)[number];

export type SocialLinks = Partial<Record<'instagram' | 'facebook' | 'x' | 'youtube', string>>;
export type OpeningHours = Partial<
  Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', { open: string; close: string }[]>
>;

export const businesses = pgTable(
  'businesses',
  {
    id: idColumn(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    description: varchar('description', { length: 2000 }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    /** Shop phone, E.164. */
    phone: varchar('phone', { length: 20 }).notNull(),
    whatsapp: varchar('whatsapp', { length: 20 }),
    email: varchar('email', { length: 254 }),
    website: varchar('website', { length: 300 }),
    socialLinks: jsonb('social_links').$type<SocialLinks>().notNull().default({}),
    /** Shop/establishment registration number. Optional unless the verification setting requires it. */
    registrationNumber: varchar('registration_number', { length: 50 }),
    status: businessStatus('status').notNull().default('PENDING'),
    /** Rejection or suspension reason, shown to the owner. */
    statusReason: varchar('status_reason', { length: 1000 }),
    submittedAt: timestamptz('submitted_at'),
    verifiedAt: timestamptz('verified_at'),
    verifiedBy: uuid('verified_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('businesses_slug_key').on(t.slug),
    index('businesses_owner_user_id_idx').on(t.ownerUserId),
    index('businesses_status_idx').on(t.status),
    index('businesses_category_id_idx').on(t.categoryId),
  ],
);

/** Physical location(s). MVP: exactly one primary location per business (branches are V2). */
export const businessLocations = pgTable(
  'business_locations',
  {
    id: idColumn(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    isPrimary: boolean('is_primary').notNull().default(true),
    /** Includes the door/shop number, e.g. "Shop 12, Laxmi Complex, Station Road". */
    addressLine1: varchar('address_line1', { length: 200 }).notNull(),
    addressLine2: varchar('address_line2', { length: 200 }),
    localityId: uuid('locality_id').references(() => localities.id, { onDelete: 'restrict' }),
    cityId: uuid('city_id')
      .notNull()
      .references(() => cities.id, { onDelete: 'restrict' }),
    postalCode: varchar('postal_code', { length: 10 }),
    location: geographyPoint('location').notNull(),
    openingHours: jsonb('opening_hours').$type<OpeningHours>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('business_locations_primary_key')
      .on(t.businessId)
      .where(sql`${t.isPrimary}`),
    index('business_locations_location_gist').using('gist', t.location),
    index('business_locations_city_id_idx').on(t.cityId),
    index('business_locations_locality_id_idx').on(t.localityId),
  ],
);

/** Who may manage a business. The registering user is the OWNER. */
export const businessStaff = pgTable(
  'business_staff',
  {
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: businessStaffRole('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.businessId, t.userId] }),
    index('business_staff_user_id_idx').on(t.userId),
  ],
);

/**
 * Image metadata; the files live in object storage under `storagePrefix`.
 * LOGO/GALLERY are public once the business is verified. VERIFICATION_* are never public.
 */
export const businessImages = pgTable(
  'business_images',
  {
    id: idColumn(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    kind: businessImageKind('kind').notNull(),
    storagePrefix: varchar('storage_prefix', { length: 200 }).notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bytes: integer('bytes').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('business_images_business_kind_idx').on(t.businessId, t.kind)],
);

export type BusinessRow = typeof businesses.$inferSelect;
export type BusinessLocationRow = typeof businessLocations.$inferSelect;
export type BusinessImageRow = typeof businessImages.$inferSelect;
