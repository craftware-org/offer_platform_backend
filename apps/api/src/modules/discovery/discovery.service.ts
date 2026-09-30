import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gt, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { AppError } from '../../common/errors/app-error.js';
import { offsetOf, Page, type PageQuery } from '../../common/http/pagination.js';
import { DB, type Database } from '../../infrastructure/database/database.module.js';
import { businessLocations, businesses } from '../businesses/businesses.schema.js';
import { categories } from '../categories/categories.schema.js';
import { CategoriesService } from '../categories/categories.service.js';
import { LocationsService } from '../locations/locations.service.js';
import { OfferReader } from '../offers/offer-reader.js';
import { toPublicOfferView, type PublicOfferView } from '../offers/offer-views.js';
import { offers } from '../offers/offers.schema.js';
import {
  DEFAULT_RADIUS_KM,
  ENDING_SOON_WINDOW_HOURS,
  FRESHNESS_TAU_SECONDS,
  RANKING_WEIGHTS as W,
} from './ranking.js';
import { parseSearch } from './search-parser.js';

export type DiscoverySort = 'relevance' | 'recommended' | 'nearest' | 'newest' | 'ending_soon' | 'discount';

export interface DiscoveryQuery extends PageQuery {
  q?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  city?: string;
  locality?: string;
  category?: string;
  business?: string;
  /** Paise. */
  maxPrice?: number;
  minDiscount?: number;
  endingWithinHours?: number;
  sort?: DiscoverySort;
}

export interface DiscoveredOffer extends PublicOfferView {
  /** Straight-line distance from the customer, when a location was given. */
  distanceKm: number | null;
}

/** How the query was understood (shown so apps can display chips like "under ₹2,000 · near you"). */
export interface Interpretation {
  text: string | null;
  maxPrice: number | null;
  minDiscount: number | null;
  nearMe: boolean;
  locality: { id: string; name: string; slug: string } | null;
  radiusKm: number | null;
  sort: DiscoverySort;
  /** "near me" was asked for but no location was sent: the app should request it. */
  needsLocation: boolean;
}

/** Customer-facing discovery: search, filters, nearby and ranked feeds (spec §7, §9-11, §33). */
@Injectable()
export class DiscoveryService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly reader: OfferReader,
    private readonly categoriesService: CategoriesService,
    private readonly locations: LocationsService,
  ) {}

  async search(query: DiscoveryQuery): Promise<Page<DiscoveredOffer>> {
    const now = new Date();
    const parsed = query.q ? parseSearch(query.q) : { text: '', nearMe: false };
    const point = query.lat !== undefined && query.lng !== undefined ? { lat: query.lat, lng: query.lng } : null;
    const radiusKm = point ? (query.radiusKm ?? DEFAULT_RADIUS_KM) : null;

    // ---- Resolve names to ids -----------------------------------------------------------------
    let cityId: string | undefined;
    let locality: Interpretation['locality'] = null;
    let text = parsed.text;
    if (query.city) cityId = (await this.locations.getCityBySlug(query.city)).id;
    if (query.locality) {
      if (!cityId) throw AppError.validation({ locality: 'Provide city together with locality' });
      const found = await this.locations.getLocalityBySlug(cityId, query.locality);
      locality = { id: found.id, name: found.name, slug: found.slug };
    } else if ('place' in parsed && parsed.place) {
      const found = await this.locations.findLocalityByPhrase(parsed.place, cityId);
      if (found) locality = { id: found.id, name: found.name, slug: found.slug };
      else text = `${text} ${parsed.place}`.trim(); // not a known place: search it as words
    }
    const maxPrice = query.maxPrice ?? ('maxPrice' in parsed ? parsed.maxPrice : undefined);
    const minDiscount = query.minDiscount ?? ('minDiscount' in parsed ? parsed.minDiscount : undefined);
    const sort: DiscoverySort = query.sort ?? (text ? 'relevance' : point ? 'recommended' : 'newest');
    if (sort === 'nearest' && !point) throw AppError.validation({ sort: 'Sorting by distance needs lat and lng' });

    // ---- Filters: only live offers of verified businesses, then what the customer asked for ----
    const filters: SQL[] = [
      eq(offers.status, 'ACTIVE'),
      lte(offers.startsAt, now),
      gt(offers.expiresAt, now),
      eq(businesses.status, 'VERIFIED'),
      eq(businessLocations.isPrimary, true),
    ];
    const pointSql = point ? sql`ST_SetSRID(ST_MakePoint(${point.lng}::float8, ${point.lat}::float8), 4326)::geography` : null;
    if (pointSql && radiusKm) {
      filters.push(sql`ST_DWithin(${businessLocations.location}, ${pointSql}, ${radiusKm * 1000}::float8)`);
    }
    if (cityId) filters.push(eq(businessLocations.cityId, cityId));
    if (locality) filters.push(eq(businessLocations.localityId, locality.id));
    if (query.category) {
      filters.push(inArray(offers.categoryId, await this.categoriesService.idsForSlug(query.category)));
    }
    if (query.business) filters.push(eq(businesses.slug, query.business));
    if (maxPrice !== undefined) filters.push(lte(offers.offerPrice, maxPrice));
    if (minDiscount !== undefined) filters.push(gte(offers.discountPercent, minDiscount));
    if (query.endingWithinHours !== undefined) {
      filters.push(lte(offers.expiresAt, new Date(now.getTime() + query.endingWithinHours * 3_600_000)));
    }

    const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const tsQuery = sql`websearch_to_tsquery('english', ${text})`;
    if (text) {
      filters.push(sql`(
        "offers"."search_vector" @@ ${tsQuery}
        or ${offers.title} ilike ${like}
        or ${businesses.name} ilike ${like}
        or ${categories.name} ilike ${like}
        or word_similarity(${text}, ${offers.title}) > 0.45
        or word_similarity(${text}, ${categories.name}) > 0.45
      )`);
    }

    // ---- Ranking ---------------------------------------------------------------------------------
    // Every number is sent as an explicitly typed float8 parameter: PostgreSQL otherwise infers a
    // parameter's type from its neighbour (e.g. "$1 * 0" makes $1 an integer, rejecting 0.25).
    const f = (n: number) => sql`${n}::float8`;
    const nowSql = sql`${now.toISOString()}::timestamptz`;
    const distanceM = pointSql
      ? sql<number>`ST_Distance(${businessLocations.location}, ${pointSql})`
      : sql<null>`null`;
    const textScore = text
      ? sql`least(1, greatest(
          ts_rank("offers"."search_vector", ${tsQuery}) * 2,
          word_similarity(${text}, ${offers.title}),
          word_similarity(${text}, ${categories.name}) * 0.8,
          similarity(${text}, ${businesses.name}) * 0.8))::float8`
      : f(0);
    const distanceScore =
      pointSql && radiusKm ? sql`greatest(0, 1 - ${distanceM} / ${f(radiusKm * 1000)})` : f(0);
    const freshness = sql`exp(-extract(epoch from (${nowSql} - coalesce(${offers.approvedAt}, ${offers.startsAt})))::float8 / ${f(FRESHNESS_TAU_SECONDS)})`;
    const endingSoon = sql`greatest(0, 1 - extract(epoch from (${offers.expiresAt} - ${nowSql}))::float8 / ${f(ENDING_SOON_WINDOW_HOURS * 3600)})`;
    const discount = sql`coalesce(${offers.discountPercent}, 0)::float8 / 100.0`;
    const score = sql<number>`(
      ${f(W.text)} * ${textScore} + ${f(W.distance)} * ${distanceScore} + ${f(W.freshness)} * ${freshness}
      + ${f(W.endingSoon)} * ${endingSoon} + ${f(W.discount)} * ${discount})`;

    const order: SQL[] = {
      relevance: [sql`${score} desc`],
      recommended: [sql`${score} desc`],
      nearest: [sql`${distanceM} asc`],
      newest: [desc(offers.approvedAt)],
      ending_soon: [asc(offers.expiresAt)],
      discount: [sql`${offers.discountPercent} desc nulls last`],
    }[sort];

    const from = () =>
      this.db
        .select({ id: offers.id, distanceM })
        .from(offers)
        .innerJoin(businesses, eq(businesses.id, offers.businessId))
        .innerJoin(businessLocations, eq(businessLocations.businessId, businesses.id))
        .innerJoin(categories, eq(categories.id, offers.categoryId));
    const where = and(...filters);

    const [rows, [total]] = await Promise.all([
      from()
        .where(where)
        .orderBy(...order, desc(offers.id))
        .limit(query.pageSize)
        .offset(offsetOf(query)),
      this.db
        .select({ value: count() })
        .from(offers)
        .innerJoin(businesses, eq(businesses.id, offers.businessId))
        .innerJoin(businessLocations, eq(businessLocations.businessId, businesses.id))
        .innerJoin(categories, eq(categories.id, offers.categoryId))
        .where(where),
    ]);

    const bundles = await this.reader.bundles(rows.map((r) => r.id));
    const distanceById = new Map(rows.map((r) => [r.id, r.distanceM]));
    const items = bundles.map((b) => {
      const meters = distanceById.get(b.offer.id);
      return {
        ...toPublicOfferView(b, now),
        distanceKm: meters === null || meters === undefined ? null : Math.round(Number(meters) / 100) / 10,
      };
    });

    const interpretation: Interpretation = {
      text: text || null,
      maxPrice: maxPrice ?? null,
      minDiscount: minDiscount ?? null,
      nearMe: parsed.nearMe,
      locality,
      radiusKm,
      sort,
      needsLocation: parsed.nearMe && !point,
    };
    return new Page(items, query, total?.value ?? 0, { interpretation });
  }

  /** Home screen sections (spec §7). Trending and followed businesses arrive with engagement (Phase 5). */
  async home(input: { lat?: number; lng?: number; radiusKm?: number; city?: string }) {
    const base = { ...input, page: 1, pageSize: 10 };
    const hasPoint = input.lat !== undefined && input.lng !== undefined;
    const [nearby, recommended, newOffers, endingSoon] = await Promise.all([
      hasPoint ? this.search({ ...base, sort: 'nearest' }) : Promise.resolve(null),
      this.search({ ...base, sort: 'recommended' }),
      this.search({ ...base, sort: 'newest' }),
      this.search({ ...base, sort: 'ending_soon', endingWithinHours: ENDING_SOON_WINDOW_HOURS }),
    ]);
    return {
      nearby: nearby?.items ?? [],
      recommended: recommended.items,
      newOffers: newOffers.items,
      endingSoon: endingSoon.items,
      needsLocation: !hasPoint,
    };
  }
}
