import { boolean, char, index, integer, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, idColumn, updatedAt } from '../../infrastructure/database/columns.js';
import { geographyPoint } from '../../infrastructure/database/postgis.js';

/** Cities the platform operates in. Adding a city is how the platform expands (no code change). */
export const cities = pgTable(
  'cities',
  {
    id: idColumn(),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    state: varchar('state', { length: 100 }).notNull(),
    countryCode: char('country_code', { length: 2 }).notNull().default('IN'),
    timezone: varchar('timezone', { length: 50 }).notNull().default('Asia/Kolkata'),
    /** Approximate city centre; business pins must fall within serviceRadiusKm of it. */
    center: geographyPoint('center').notNull(),
    serviceRadiusKm: integer('service_radius_km').notNull().default(40),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('cities_slug_key').on(t.slug)],
);

/** Neighbourhoods within a city (e.g. used for "fashion in <locality>"). Managed by admins. */
export const localities = pgTable(
  'localities',
  {
    id: idColumn(),
    cityId: uuid('city_id')
      .notNull()
      .references(() => cities.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('localities_city_slug_key').on(t.cityId, t.slug),
    index('localities_city_id_idx').on(t.cityId),
  ],
);

export type CityRow = typeof cities.$inferSelect;
export type LocalityRow = typeof localities.$inferSelect;
