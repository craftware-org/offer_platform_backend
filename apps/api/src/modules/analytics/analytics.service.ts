import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { hashIp, isLikelyBot } from '../../common/http/visitors.js';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';
import { DB, type Database } from '../../infrastructure/database/database.module.js';
import { REDIS } from '../../infrastructure/redis/redis.token.js';
import { BusinessesService } from '../businesses/businesses.service.js';
import type { AnalyticsEventType } from '../engagement/engagement.schema.js';
import { EngagementService } from '../engagement/engagement.service.js';
import { cities } from '../locations/locations.schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { addDays, dayStart, daysBetween, type DayRange, istDay, liveFrom, rangeEndingToday } from './analytics-time.js';
import { analyticsDaily, searchLogs } from './analytics.schema.js';
import { normalizeSearch } from './search-normalize.js';

/** Raw events and search logs older than this are deleted; daily totals stay (owner, 2026-10-08). */
export const RAW_RETENTION_DAYS = 180;
/** The same search from the same visitor within this window counts once. */
const SEARCH_DEDUPE_SECONDS = 30 * 60;
const TOP_LIST = 10;
const TOP_SEARCHES = 20;

export const METRICS = [
  'offerViews',
  'shopViews',
  'saves',
  'shares',
  'calls',
  'whatsapp',
  'website',
  'directions',
  'follows',
] as const;
export type Metric = (typeof METRICS)[number];
export type Totals = Record<Metric, number>;

const METRIC_OF: Partial<Record<AnalyticsEventType, Metric>> = {
  OFFER_VIEWED: 'offerViews',
  BUSINESS_VIEWED: 'shopViews',
  OFFER_SAVED: 'saves',
  OFFER_SHARED: 'shares',
  CALL_CLICKED: 'calls',
  WHATSAPP_CLICKED: 'whatsapp',
  WEBSITE_CLICKED: 'website',
  DIRECTIONS_CLICKED: 'directions',
  BUSINESS_FOLLOWED: 'follows',
};
const emptyTotals = (): Totals => Object.fromEntries(METRICS.map((m) => [m, 0])) as Totals;
/** Page views: offer pages plus the shop page. */
const views = (t: Totals) => t.offerViews + t.shopViews;
/** Ways of getting in touch. */
const contactTaps = (t: Totals) => t.calls + t.whatsapp + t.website + t.directions;
/** Every tap: shares and contact taps. */
const taps = (t: Totals) => t.shares + contactTaps(t);

type CountRow = {
  day: string;
  businessId: string;
  offerId: string | null;
  type: AnalyticsEventType;
  count: number;
};

export interface DayPoint {
  day: string;
  views: number;
  taps: number;
}

export interface OfferPerformance {
  offerId: string;
  title: string;
  slug: string;
  status: string;
  views: number;
  saves: number;
  shares: number;
  contactTaps: number;
  /** Taps (shares + contact taps) per 100 views; null when there were no views. */
  tapsPer100Views: number | null;
}

export interface BusinessInsights {
  days: number;
  range: DayRange;
  totals: Totals;
  previous: Totals;
  daily: DayPoint[];
  offers: OfferPerformance[];
  bestOfferId: string | null;
}

export interface Series {
  day: string;
  value: number;
}

const DAY_SQL = (column: unknown) => sql<string>`to_char(${column} AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`;

/**
 * Phase 7 analytics (ADR-0017). A read-only reporting module, like discovery: it may read other
 * modules' tables for aggregate numbers but writes only its own (`analytics_daily`,
 * `search_logs`). Raw events belong to the engagement module, which also purges them.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly engagement: EngagementService,
    private readonly businesses: BusinessesService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- Worker jobs ---------------------------------------------------------------------------

  /**
   * Rebuilds the daily totals of the two days before today (India time), plus any days missed since
   * the last run (at most the 180 days raw events are kept). Idempotent: each day is replaced in one
   * transaction, so a re-run or an overlap never double counts.
   */
  async rollup(now = new Date()): Promise<{ days: string[]; rows: number }> {
    const today = istDay(now);
    // Normally the two days before today; more when catching up (first run, or the worker was down).
    const marks = await this.db.execute<{ last_day: string | null; first_event: Date | null }>(sql`
      SELECT (SELECT to_char(max(day), 'YYYY-MM-DD') FROM analytics_daily) AS last_day,
             (SELECT min(created_at) FROM analytics_events) AS first_event`);
    const { last_day, first_event } = marks.rows[0]!;
    const candidates = [addDays(today, -2)];
    if (last_day) candidates.push(addDays(last_day, 1));
    else if (first_event) candidates.push(istDay(new Date(first_event)));
    const earliest = candidates.sort()[0]!;
    const oldestKept = addDays(today, -RAW_RETENTION_DAYS);
    const days = daysBetween(earliest > oldestKept ? earliest : oldestKept, addDays(today, -1));
    let rows = 0;
    for (const day of days) {
      rows += await this.db.transaction(async (tx) => {
        await tx.delete(analyticsDaily).where(eq(analyticsDaily.day, day));
        const inserted = await tx.execute(sql`
          INSERT INTO analytics_daily (day, business_id, offer_id, type, count)
          SELECT ${day}::date, business_id, offer_id, type, count(*)::int
          FROM analytics_events
          WHERE created_at >= ${dayStart(day)} AND created_at < ${dayStart(addDays(day, 1))}
          GROUP BY business_id, offer_id, type`);
        return inserted.rowCount ?? 0;
      });
    }
    return { days, rows };
  }

  /** Deletes raw events and search logs older than 180 days (daily totals are kept). */
  async purge(now = new Date()): Promise<{ events: number; searches: number }> {
    const cutoff = dayStart(addDays(istDay(now), -RAW_RETENTION_DAYS));
    const events = await this.engagement.purgeEventsBefore(cutoff);
    const searches = await this.db.delete(searchLogs).where(lt(searchLogs.createdAt, cutoff)).returning({ id: searchLogs.id });
    return { events, searches: searches.length };
  }

  // ---- Searches -------------------------------------------------------------------------------

  /**
   * Records a search (first page only; the caller checks). Bots are skipped, and the same words
   * from the same visitor within 30 minutes count once, so changing a filter or the sort order is
   * not a new search. Never throws: analytics must not break search.
   */
  async recordSearch(input: {
    query: string;
    citySlug?: string;
    results: number;
    ip?: string;
    userAgent?: string;
    loggedIn: boolean;
  }): Promise<void> {
    try {
      if (!input.loggedIn && isLikelyBot(input.userAgent)) return;
      const query = normalizeSearch(input.query);
      if (!query) return;
      const visitor = hashIp(`${input.ip}|${input.userAgent ?? ''}`, this.config.OTP_HASH_SECRET);
      const what = createHash('sha256').update(`${query}|${input.citySlug ?? ''}`).digest('base64url').slice(0, 16);
      const first = await this.redis.set(`search:dedupe:${visitor}:${what}`, '1', 'EX', SEARCH_DEDUPE_SECONDS, 'NX');
      if (!first) return;
      let cityId: string | null = null;
      if (input.citySlug) {
        const [city] = await this.db.select({ id: cities.id }).from(cities).where(eq(cities.slug, input.citySlug));
        cityId = city?.id ?? null;
      }
      await this.db.insert(searchLogs).values({ query, cityId, results: input.results });
    } catch (error) {
      this.logger.warn({ err: error }, 'Could not record a search');
    }
  }

  // ---- Business dashboard -------------------------------------------------------------------

  /** Performance of one business the caller manages, for the last 7, 30 or 90 days. */
  async businessInsights(userId: string, businessId: string, days: number, now = new Date()): Promise<BusinessInsights> {
    await this.businesses.getManaged(userId, businessId); // 404 unless the caller manages it
    const { current, previous } = rangeEndingToday(days, now);
    const rows = await this.counts({ from: previous.from, to: current.to }, now, businessId);
    const inCurrent = rows.filter((r) => r.day >= current.from);

    const perOffer = new Map<string, Totals>();
    for (const r of inCurrent) {
      if (!r.offerId) continue;
      const metric = METRIC_OF[r.type];
      if (!metric) continue;
      const t = perOffer.get(r.offerId) ?? perOffer.set(r.offerId, emptyTotals()).get(r.offerId)!;
      t[metric] += r.count;
    }
    const offerRows = await this.db.execute<{ id: string; title: string; slug: string; status: string }>(sql`
      SELECT id, title, slug, status FROM offers
      WHERE business_id = ${businessId}
        AND (status IN ('ACTIVE', 'SCHEDULED', 'PAUSED')${perOffer.size ? sql` OR id IN ${[...perOffer.keys()]}` : sql``})`);
    const offers = offerRows.rows
      .map((o): OfferPerformance => {
        const t = perOffer.get(o.id) ?? emptyTotals();
        return {
          offerId: o.id,
          title: o.title,
          slug: o.slug,
          status: o.status,
          views: t.offerViews,
          saves: t.saves,
          shares: t.shares,
          contactTaps: contactTaps(t),
          tapsPer100Views: t.offerViews ? Math.round((taps(t) / t.offerViews) * 1000) / 10 : null,
        };
      })
      .sort((a, b) => score(b) - score(a) || b.views - a.views || a.title.localeCompare(b.title));
    const best = offers[0];

    return {
      days,
      range: current,
      totals: sum(inCurrent),
      previous: sum(rows.filter((r) => r.day < current.from)),
      daily: dailyPoints(inCurrent, current),
      offers,
      bestOfferId: best && score(best) + best.views > 0 ? best.offerId : null,
    };
  }

  // ---- Admin dashboard ----------------------------------------------------------------------

  async adminInsights(days: number, citySlug: string | undefined, now = new Date()) {
    const { current, previous } = rangeEndingToday(days, now);
    const start = dayStart(current.from);
    const rows = await this.counts({ from: previous.from, to: current.to }, now);
    const inCurrent = rows.filter((r) => r.day >= current.from);

    const series = async (query: ReturnType<typeof sql>) =>
      fillSeries((await this.db.execute<{ day: string; value: number }>(query)).rows, current);
    const one = async <T>(query: ReturnType<typeof sql>) => (await this.db.execute<T & Record<string, unknown>>(query)).rows[0]!;

    // Users (logins = new sessions; every login starts a new refresh-token family).
    const signups = await series(sql`
      SELECT ${DAY_SQL(sql`created_at`)} AS day, count(*)::int AS value FROM users
      WHERE created_at >= ${start} GROUP BY 1`);
    const logins = await series(sql`
      SELECT ${DAY_SQL(sql`first`)} AS day, count(*)::int AS value
      FROM (SELECT min(created_at) AS first FROM refresh_tokens GROUP BY family_id HAVING min(created_at) >= ${start}) s
      GROUP BY 1`);
    const userCounts = await one<{ total: number; active7: number; active30: number }>(sql`
      SELECT
        (SELECT count(*)::int FROM users WHERE status <> 'DELETED') AS total,
        (SELECT count(DISTINCT user_id)::int FROM refresh_tokens WHERE created_at >= ${new Date(now.getTime() - 7 * 86_400_000)}) AS active7,
        (SELECT count(DISTINCT user_id)::int FROM refresh_tokens WHERE created_at >= ${new Date(now.getTime() - 30 * 86_400_000)}) AS active30`);

    // Businesses and offers.
    const newBusinesses = await series(sql`
      SELECT ${DAY_SQL(sql`created_at`)} AS day, count(*)::int AS value FROM businesses
      WHERE created_at >= ${start} GROUP BY 1`);
    const byStatus = (
      await this.db.execute<{ status: string; value: number }>(sql`
        SELECT status, count(*)::int AS value FROM businesses GROUP BY status ORDER BY status`)
    ).rows;
    const published = await series(sql`
      SELECT ${DAY_SQL(sql`first_published_at`)} AS day, count(*)::int AS value FROM offers
      WHERE first_published_at >= ${start} GROUP BY 1`);
    const live = sql`o.status = 'ACTIVE' AND o.starts_at <= ${now} AND o.expires_at > ${now} AND b.status = 'VERIFIED'`;
    const liveByCity = (
      await this.db.execute<{ label: string; value: number }>(sql`
        SELECT c.name AS label, count(*)::int AS value
        FROM offers o
        JOIN businesses b ON b.id = o.business_id
        JOIN business_locations l ON l.business_id = b.id AND l.is_primary
        JOIN cities c ON c.id = l.city_id
        WHERE ${live} GROUP BY c.name ORDER BY value DESC, label`)
    ).rows;
    const liveByCategory = (
      await this.db.execute<{ label: string; value: number }>(sql`
        SELECT coalesce(parent.name, cat.name) AS label, count(*)::int AS value
        FROM offers o
        JOIN businesses b ON b.id = o.business_id
        JOIN categories cat ON cat.id = o.category_id
        LEFT JOIN categories parent ON parent.id = cat.parent_id
        WHERE ${live} GROUP BY 1 ORDER BY value DESC, label`)
    ).rows;

    // Review queues: how many are waiting and since when.
    const queues = await one<{
      businesses: number;
      businesses_oldest: Date | null;
      offers: number;
      offers_oldest: Date | null;
      reports: number;
      reports_oldest: Date | null;
    }>(sql`
      SELECT
        (SELECT count(*)::int FROM businesses WHERE status = 'UNDER_REVIEW') AS businesses,
        (SELECT min(submitted_at) FROM businesses WHERE status = 'UNDER_REVIEW') AS businesses_oldest,
        (SELECT count(*)::int FROM offers WHERE status = 'PENDING_REVIEW') AS offers,
        (SELECT min(submitted_at) FROM offers WHERE status = 'PENDING_REVIEW') AS offers_oldest,
        (SELECT count(*)::int FROM reports WHERE status = 'OPEN') AS reports,
        (SELECT min(created_at) FROM reports WHERE status = 'OPEN') AS reports_oldest`);

    // Engagement: totals, top offers and shops.
    const perOffer = new Map<string, Totals>();
    const perBusiness = new Map<string, Totals>();
    for (const r of inCurrent) {
      const metric = METRIC_OF[r.type];
      if (!metric) continue;
      const b = perBusiness.get(r.businessId) ?? perBusiness.set(r.businessId, emptyTotals()).get(r.businessId)!;
      b[metric] += r.count;
      if (r.offerId) {
        const o = perOffer.get(r.offerId) ?? perOffer.set(r.offerId, emptyTotals()).get(r.offerId)!;
        o[metric] += r.count;
      }
    }
    const topOfferIds = top(perOffer, (t) => t.offerViews, taps);
    const topBusinessIds = top(perBusiness, views, taps);
    const offerLabels = topOfferIds.length
      ? (
          await this.db.execute<{ id: string; title: string; slug: string; business: string }>(sql`
            SELECT o.id, o.title, o.slug, b.name AS business FROM offers o JOIN businesses b ON b.id = o.business_id
            WHERE o.id IN ${topOfferIds}`)
        ).rows
      : [];
    const businessLabels = topBusinessIds.length
      ? (
          await this.db.execute<{ id: string; name: string; slug: string }>(sql`
            SELECT id, name, slug FROM businesses WHERE id IN ${topBusinessIds}`)
        ).rows
      : [];

    // Searches.
    let cityId: string | null = null;
    if (citySlug) {
      const [city] = await this.db.select({ id: cities.id }).from(cities).where(eq(cities.slug, citySlug));
      cityId = city?.id ?? '00000000-0000-0000-0000-000000000000';
    }
    const searchWhere = and(gte(searchLogs.createdAt, start), cityId ? eq(searchLogs.cityId, cityId) : undefined);
    const [searchTotal] = await this.db.select({ value: sql<number>`count(*)::int` }).from(searchLogs).where(searchWhere);
    const topSearches = await this.db
      .select({
        query: searchLogs.query,
        count: sql<number>`count(*)::int`.as('count'),
        avgResults: sql<number>`round(avg(${searchLogs.results}))::int`,
      })
      .from(searchLogs)
      .where(searchWhere)
      .groupBy(searchLogs.query)
      .orderBy(sql`count DESC`, searchLogs.query)
      .limit(TOP_SEARCHES);
    const noResults = await this.db
      .select({ query: searchLogs.query, count: sql<number>`count(*)::int`.as('count') })
      .from(searchLogs)
      .where(and(searchWhere, eq(searchLogs.results, 0)))
      .groupBy(searchLogs.query)
      .orderBy(sql`count DESC`, searchLogs.query)
      .limit(TOP_SEARCHES);

    const totals = sum(inCurrent);
    const prev = sum(rows.filter((r) => r.day < current.from));
    return {
      days,
      range: current,
      users: { total: userCounts.total, active7: userCounts.active7, active30: userCounts.active30, signups, logins },
      businesses: { byStatus, new: newBusinesses },
      offers: {
        liveNow: liveByCity.reduce((n, r) => n + r.value, 0),
        published,
        liveByCity,
        liveByCategory,
      },
      queues: {
        businesses: { waiting: queues.businesses, oldestSince: queues.businesses_oldest },
        offers: { waiting: queues.offers, oldestSince: queues.offers_oldest },
        reports: { waiting: queues.reports, oldestSince: queues.reports_oldest },
      },
      engagement: {
        totals: { views: views(totals), saves: totals.saves, taps: taps(totals), follows: totals.follows },
        previous: { views: views(prev), saves: prev.saves, taps: taps(prev), follows: prev.follows },
        daily: dailyPoints(inCurrent, current),
      },
      topOffers: topOfferIds.flatMap((id) => {
        const label = offerLabels.find((l) => l.id === id);
        const t = perOffer.get(id)!;
        return label ? [{ offerId: id, title: label.title, slug: label.slug, business: label.business, views: t.offerViews, taps: taps(t) }] : [];
      }),
      topBusinesses: topBusinessIds.flatMap((id) => {
        const label = businessLabels.find((l) => l.id === id);
        const t = perBusiness.get(id)!;
        return label ? [{ businessId: id, name: label.name, slug: label.slug, views: views(t), taps: taps(t) }] : [];
      }),
      searches: { total: searchTotal?.value ?? 0, top: topSearches, noResults },
    };
  }

  // ---- Weekly summary for businesses ------------------------------------------------------

  /**
   * Monday morning: last week's numbers (Monday–Sunday) to each verified business with any activity
   * or a live offer, through the notifications inbox and email (owner decision 2026-10-08).
   */
  async sendWeeklySummaries(now = new Date()): Promise<number> {
    const to = addDays(istDay(now), -1);
    const week: DayRange = { from: addDays(to, -6), to };
    const rows = await this.counts(week, now);
    const perBusiness = new Map<string, Totals>();
    const perOffer = new Map<string, Totals>();
    for (const r of rows) {
      const metric = METRIC_OF[r.type];
      if (!metric) continue;
      const b = perBusiness.get(r.businessId) ?? perBusiness.set(r.businessId, emptyTotals()).get(r.businessId)!;
      b[metric] += r.count;
      if (r.offerId) {
        const o = perOffer.get(r.offerId) ?? perOffer.set(r.offerId, emptyTotals()).get(r.offerId)!;
        o[metric] += r.count;
      }
    }
    const candidates = (
      await this.db.execute<{ id: string; name: string; live: number }>(sql`
        SELECT b.id, b.name,
          (SELECT count(*)::int FROM offers o WHERE o.business_id = b.id AND o.status = 'ACTIVE'
             AND o.starts_at <= ${now} AND o.expires_at > ${now}) AS live
        FROM businesses b WHERE b.status = 'VERIFIED'`)
    ).rows;
    const offerIds = [...perOffer.keys()];
    const offerInfo = offerIds.length
      ? (
          await this.db.execute<{ id: string; business_id: string; title: string }>(sql`
            SELECT id, business_id, title FROM offers WHERE id IN ${offerIds}`)
        ).rows
      : [];

    let sent = 0;
    for (const business of candidates) {
      const t = perBusiness.get(business.id) ?? emptyTotals();
      const active = views(t) + taps(t) + t.saves + t.follows > 0;
      if (!active && business.live === 0) continue;
      const best = offerInfo
        .filter((o) => o.business_id === business.id)
        .map((o) => ({ title: o.title, t: perOffer.get(o.id)! }))
        .sort((a, b) => taps(b.t) + b.t.saves - (taps(a.t) + a.t.saves) || b.t.offerViews - a.t.offerViews)[0];
      const body = active
        ? [
            `Saves: ${t.saves} · New followers: ${t.follows} · Calls and WhatsApp: ${t.calls + t.whatsapp}.`,
            best ? `Best offer: “${best.title}” (${best.t.offerViews} views).` : '',
          ]
            .filter(Boolean)
            .join(' ')
        : 'No visits last week. Share your offer link on WhatsApp to bring customers in.';
      sent += await this.notifications.notify(
        await this.businesses.memberUserIds(business.id),
        {
          type: 'BUSINESS_WEEKLY_SUMMARY',
          title: `${business.name} last week on ${this.config.APP_DISPLAY_NAME}: ${views(t)} views, ${taps(t)} taps`,
          body,
          link: `/business/${business.id}/insights`,
          dedupeKey: `weekly:${business.id}:${week.from}`,
        },
        now,
      );
    }
    return sent;
  }

  // ---- Counting -----------------------------------------------------------------------------

  /**
   * Event counts per day, business, offer and type for a range: daily totals for days before
   * `liveFrom`, raw events from then on (so dashboards are never a day behind).
   */
  private async counts(range: DayRange, now: Date, businessId?: string): Promise<CountRow[]> {
    const boundary = liveFrom(now);
    const out: CountRow[] = [];
    if (range.from < boundary) {
      const rows = await this.db
        .select({
          day: analyticsDaily.day,
          businessId: analyticsDaily.businessId,
          offerId: analyticsDaily.offerId,
          type: analyticsDaily.type,
          count: analyticsDaily.count,
        })
        .from(analyticsDaily)
        .where(
          and(
            gte(analyticsDaily.day, range.from),
            lt(analyticsDaily.day, boundary <= range.to ? boundary : addDays(range.to, 1)),
            businessId ? eq(analyticsDaily.businessId, businessId) : undefined,
          ),
        );
      out.push(...rows);
    }
    const liveStart = range.from > boundary ? range.from : boundary;
    if (liveStart <= range.to) {
      const rows = await this.db.execute<CountRow>(sql`
        SELECT ${DAY_SQL(sql`created_at`)} AS "day", business_id AS "businessId", offer_id AS "offerId",
               type, count(*)::int AS "count"
        FROM analytics_events
        WHERE created_at >= ${dayStart(liveStart)} AND created_at < ${dayStart(addDays(range.to, 1))}
          ${businessId ? sql`AND business_id = ${businessId}` : sql``}
        GROUP BY 1, 2, 3, 4`);
      out.push(...rows.rows);
    }
    return out;
  }
}

const score = (o: OfferPerformance) => o.saves + o.shares + o.contactTaps;

function sum(rows: CountRow[]): Totals {
  const t = emptyTotals();
  for (const r of rows) {
    const metric = METRIC_OF[r.type];
    if (metric) t[metric] += r.count;
  }
  return t;
}

function dailyPoints(rows: CountRow[], range: DayRange): DayPoint[] {
  const byDay = new Map<string, Totals>();
  for (const r of rows) {
    const metric = METRIC_OF[r.type];
    if (!metric) continue;
    const t = byDay.get(r.day) ?? byDay.set(r.day, emptyTotals()).get(r.day)!;
    t[metric] += r.count;
  }
  return daysBetween(range.from, range.to).map((day) => {
    const t = byDay.get(day) ?? emptyTotals();
    return { day, views: views(t), taps: taps(t) };
  });
}

function fillSeries(rows: Series[], range: DayRange): Series[] {
  const byDay = new Map(rows.map((r) => [r.day, r.value]));
  return daysBetween(range.from, range.to).map((day) => ({ day, value: byDay.get(day) ?? 0 }));
}

function top(map: Map<string, Totals>, first: (t: Totals) => number, second: (t: Totals) => number): string[] {
  return [...map.entries()]
    .filter(([, t]) => first(t) + second(t) > 0)
    .sort(([, a], [, b]) => first(b) - first(a) || second(b) - second(a))
    .slice(0, TOP_LIST)
    .map(([id]) => id);
}
