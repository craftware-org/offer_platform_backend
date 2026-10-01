import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { AppError } from '../../common/errors/app-error.js';
import { slugify } from '../../common/text/slug.js';
import { DB, type Database, type Executor } from '../../infrastructure/database/database.module.js';
import { isUniqueViolation } from '../../infrastructure/database/pg-errors.js';
import type { GeoPoint } from '../../infrastructure/database/postgis.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { cities, localities, type CityRow, type LocalityRow } from './locations.schema.js';

export interface CityView {
  id: string;
  name: string;
  slug: string;
  state: string;
  countryCode: string;
  timezone: string;
  center: GeoPoint;
  serviceRadiusKm: number;
  isActive: boolean;
}

export interface LocalityView {
  id: string;
  cityId: string;
  name: string;
  slug: string;
  isActive: boolean;
}

export interface CityInput {
  name: string;
  slug?: string;
  state: string;
  countryCode: string;
  timezone: string;
  center: GeoPoint;
  serviceRadiusKm: number;
}

interface Actor {
  userId: string;
  requestId?: string;
}

const toCityView = (c: CityRow): CityView => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  state: c.state,
  countryCode: c.countryCode,
  timezone: c.timezone,
  center: c.center,
  serviceRadiusKm: c.serviceRadiusKm,
  isActive: c.isActive,
});

const toLocalityView = (l: LocalityRow): LocalityView => ({
  id: l.id,
  cityId: l.cityId,
  name: l.name,
  slug: l.slug,
  isActive: l.isActive,
});

const ewkt = (p: GeoPoint) => `SRID=4326;POINT(${p.longitude} ${p.latitude})`;
const slugifyPhrase = (phrase: string) => slugify(phrase, '');

@Injectable()
export class LocationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async listCities(includeInactive = false): Promise<CityView[]> {
    const rows = await this.db
      .select()
      .from(cities)
      .where(includeInactive ? undefined : eq(cities.isActive, true))
      .orderBy(asc(cities.name));
    return rows.map(toCityView);
  }

  async getCityBySlug(slug: string): Promise<CityView> {
    const [row] = await this.db.select().from(cities).where(eq(cities.slug, slug));
    if (!row || !row.isActive) throw AppError.notFound('City');
    return toCityView(row);
  }

  async listLocalities(cityId: string, includeInactive = false): Promise<LocalityView[]> {
    const rows = await this.db
      .select()
      .from(localities)
      .where(
        includeInactive
          ? eq(localities.cityId, cityId)
          : and(eq(localities.cityId, cityId), eq(localities.isActive, true)),
      )
      .orderBy(asc(localities.name));
    return rows.map(toLocalityView);
  }

  /**
   * Validates a business address: the city and locality must be active, the locality must belong
   * to the city, and the map pin must lie within the city's service radius (catches swapped
   * latitude/longitude or a pin dropped in the wrong place).
   */
  async resolveAddress(
    input: { cityId: string; localityId?: string | null; point: GeoPoint },
    db: Executor = this.db,
  ): Promise<{ city: CityView; locality: LocalityView | null }> {
    const [row] = await db
      .select({
        city: cities,
        withinRadius: sql<boolean>`ST_DWithin(${cities.center}, ${ewkt(input.point)}::geography, ${cities.serviceRadiusKm} * 1000)`,
      })
      .from(cities)
      .where(eq(cities.id, input.cityId));
    if (!row || !row.city.isActive)
      throw AppError.validation({ 'location.cityId': 'Unknown or inactive city' });
    if (!row.withinRadius) {
      throw AppError.validation({
        'location.latitude': `The map pin must be within ${row.city.serviceRadiusKm} km of ${row.city.name}`,
      });
    }

    let locality: LocalityView | null = null;
    if (input.localityId) {
      const [l] = await db.select().from(localities).where(eq(localities.id, input.localityId));
      if (!l || !l.isActive || l.cityId !== input.cityId) {
        throw AppError.validation({ 'location.localityId': 'Unknown locality for this city' });
      }
      locality = toLocalityView(l);
    }
    return { city: toCityView(row.city), locality };
  }

  /** Bulk lookup for building lists (one query per table, sequential: `db` may be a transaction). */
  async lookup(cityIds: string[], localityIds: string[], db: Executor = this.db) {
    const cityRows = cityIds.length ? await db.select().from(cities).where(inArray(cities.id, cityIds)) : [];
    const localityRows = localityIds.length
      ? await db.select().from(localities).where(inArray(localities.id, localityIds))
      : [];
    return {
      cities: new Map(cityRows.map((c) => [c.id, toCityView(c)])),
      localities: new Map(localityRows.map((l) => [l.id, toLocalityView(l)])),
    };
  }

  /**
   * An active locality whose name or slug matches a free-text phrase ("vidya nagar", "vidyanagar"),
   * optionally within one city. Used to understand searches like "fashion in Vidya Nagar".
   */
  async findLocalityByPhrase(phrase: string, cityId?: string): Promise<LocalityView | null> {
    const compact = phrase.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '');
    const rows = await this.db
      .select()
      .from(localities)
      .innerJoin(cities, eq(cities.id, localities.cityId))
      .where(
        and(
          eq(localities.isActive, true),
          eq(cities.isActive, true),
          cityId ? eq(localities.cityId, cityId) : undefined,
          sql`(lower(${localities.name}) = ${phrase.toLowerCase()}
            or ${localities.slug} = ${slugifyPhrase(phrase)}
            or regexp_replace(lower(${localities.name}), '[^[:alnum:]]', '', 'g') = ${compact})`,
        ),
      )
      .limit(2);
    // Ambiguous across cities (same name twice): don't guess.
    return rows.length === 1 && rows[0] ? toLocalityView(rows[0].localities) : null;
  }

  async getLocalityBySlug(cityId: string, slug: string): Promise<LocalityView> {
    const [row] = await this.db
      .select()
      .from(localities)
      .where(and(eq(localities.cityId, cityId), eq(localities.slug, slug)));
    if (!row || !row.isActive) throw AppError.notFound('Locality');
    return toLocalityView(row);
  }

  // ---- Admin ------------------------------------------------------------------------------

  async createCity(input: CityInput, actor: Actor): Promise<CityView> {
    const values = { ...input, slug: input.slug ?? slugify(input.name, 'city') };
    const row = await this.uniquely('A city with this slug already exists', () =>
      this.db.transaction(async (tx) => {
        const [created] = await tx.insert(cities).values(values).returning();
        if (!created) throw new Error('Insert returned no row');
        await this.audit.record(
          {
            actorUserId: actor.userId,
            action: AuditAction.CITY_CREATED,
            entityType: 'city',
            entityId: created.id,
            newValue: values,
            requestId: actor.requestId,
          },
          tx,
        );
        return created;
      }),
    );
    return toCityView(row);
  }

  async updateCity(id: string, patch: Partial<CityInput> & { isActive?: boolean }, actor: Actor) {
    const row = await this.uniquely('A city with this slug already exists', () =>
      this.db.transaction(async (tx) => {
        const [before] = await tx.select().from(cities).where(eq(cities.id, id)).for('update');
        if (!before) throw AppError.notFound('City');
        const [after] = await tx.update(cities).set(patch).where(eq(cities.id, id)).returning();
        await this.audit.record(
          {
            actorUserId: actor.userId,
            action: AuditAction.CITY_CHANGED,
            entityType: 'city',
            entityId: id,
            oldValue: pick(toCityView(before), Object.keys(patch)),
            newValue: patch,
            requestId: actor.requestId,
          },
          tx,
        );
        return after!;
      }),
    );
    return toCityView(row);
  }

  async createLocality(cityId: string, input: { name: string; slug?: string }, actor: Actor) {
    const [city] = await this.db.select({ id: cities.id }).from(cities).where(eq(cities.id, cityId));
    if (!city) throw AppError.notFound('City');
    const values = { cityId, name: input.name, slug: input.slug ?? slugify(input.name, 'locality') };
    const row = await this.uniquely('This city already has a locality with this slug', () =>
      this.db.transaction(async (tx) => {
        const [created] = await tx.insert(localities).values(values).returning();
        if (!created) throw new Error('Insert returned no row');
        await this.audit.record(
          {
            actorUserId: actor.userId,
            action: AuditAction.LOCALITY_CREATED,
            entityType: 'locality',
            entityId: created.id,
            newValue: values,
            requestId: actor.requestId,
          },
          tx,
        );
        return created;
      }),
    );
    return toLocalityView(row);
  }

  async updateLocality(
    id: string,
    patch: { name?: string; slug?: string; isActive?: boolean },
    actor: Actor,
  ) {
    const row = await this.uniquely('This city already has a locality with this slug', () =>
      this.db.transaction(async (tx) => {
        const [before] = await tx.select().from(localities).where(eq(localities.id, id)).for('update');
        if (!before) throw AppError.notFound('Locality');
        const [after] = await tx.update(localities).set(patch).where(eq(localities.id, id)).returning();
        await this.audit.record(
          {
            actorUserId: actor.userId,
            action: AuditAction.LOCALITY_CHANGED,
            entityType: 'locality',
            entityId: id,
            oldValue: pick(toLocalityView(before), Object.keys(patch)),
            newValue: patch,
            requestId: actor.requestId,
          },
          tx,
        );
        return after!;
      }),
    );
    return toLocalityView(row);
  }

  private async uniquely<T>(message: string, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isUniqueViolation(error)) throw AppError.conflict(message);
      throw error;
    }
  }
}

function pick(source: object, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((k) => [k, (source as Record<string, unknown>)[k]]));
}
