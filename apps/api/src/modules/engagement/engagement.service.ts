import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, lt } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { Page, type PageQuery } from '../../common/http/pagination.js';
import { hashIp, isLikelyBot } from '../../common/http/visitors.js';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';
import { DB, type Database } from '../../infrastructure/database/database.module.js';
import { RateLimiterService } from '../../infrastructure/redis/rate-limiter.service.js';
import { REDIS } from '../../infrastructure/redis/redis.token.js';
import { BusinessesService } from '../businesses/businesses.service.js';
import type { PublicBusinessView } from '../businesses/business-views.js';
import { OfferReader } from '../offers/offer-reader.js';
import type { PublicOfferView } from '../offers/offer-views.js';
import { OffersPublicService } from '../offers/offers-public.service.js';
import {
  analyticsEvents,
  businessFollowers,
  savedOffers,
  type AnalyticsEventType,
} from './engagement.schema.js';

/**
 * Events the website may record: page views (Phase 7) and share/contact taps (Phase 5). Saves and
 * follows are recorded by their own endpoints.
 */
export const TRACKABLE_EVENTS = [
  'OFFER_VIEWED',
  'BUSINESS_VIEWED',
  'OFFER_SHARED',
  'CALL_CLICKED',
  'WHATSAPP_CLICKED',
  'WEBSITE_CLICKED',
  'DIRECTIONS_CLICKED',
] as const;
export type TrackableEvent = (typeof TRACKABLE_EVENTS)[number];
const VIEW_EVENTS: ReadonlySet<TrackableEvent> = new Set(['OFFER_VIEWED', 'BUSINESS_VIEWED']);

/**
 * Who did something: a logged-in user, or an anonymous visitor identified only by a random id the
 * browser keeps (owner decision 2026-10-08: everyone is counted; nothing identifying is stored).
 */
export interface Actor {
  userId?: string;
  visitorId?: string;
  isAdmin?: boolean;
  userAgent?: string;
  /** Used only for a short-lived, hashed rate-limit key; never stored. */
  ip?: string;
}

/** The same person tapping the same thing again within this window counts once. */
const DEDUPE_SECONDS = 30 * 60;
/** Generous cap per person; real use is far below it. */
const EVENTS_PER_USER_PER_HOUR = 300;
/**
 * Anonymous events counted per IP address per hour. Many people can share one mobile IP, so this is
 * high; it only stops one machine inflating numbers by inventing visitor ids. Extra events are
 * skipped quietly (ADR-0017).
 */
const ANONYMOUS_EVENTS_PER_IP_PER_HOUR = 1000;
/** "Saved" lists are kept small in the MVP; older saves beyond this are not shown. */
const SAVED_LIST_CAP = 500;

export interface SavedOfferView extends PublicOfferView {
  savedAt: Date;
}

export interface EngagementCounts {
  saves: number;
  shares: number;
  calls: number;
  whatsapp: number;
  website: number;
  directions: number;
}

export interface BusinessEngagement {
  followers: number;
  totals: EngagementCounts;
  offers: (EngagementCounts & { offerId: string; title: string })[];
}

const EVENT_FIELD: Partial<Record<AnalyticsEventType, keyof EngagementCounts>> = {
  OFFER_SHARED: 'shares',
  CALL_CLICKED: 'calls',
  WHATSAPP_CLICKED: 'whatsapp',
  WEBSITE_CLICKED: 'website',
  DIRECTIONS_CLICKED: 'directions',
};
const emptyCounts = (): EngagementCounts => ({ saves: 0, shares: 0, calls: 0, whatsapp: 0, website: 0, directions: 0 });

/**
 * Customer engagement (Phase 5, spec §23–26, §30): saved offers, followed businesses and the
 * logged-in user's share/contact taps (owner decision 2026-10-03: anonymous taps are not counted).
 * Offers and businesses are reached only through their modules' exported services (ADR-0002).
 */
@Injectable()
export class EngagementService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly rateLimiter: RateLimiterService,
    private readonly offers: OffersPublicService,
    private readonly offerReader: OfferReader,
    private readonly businesses: BusinessesService,
  ) {}

  // ---- Saved offers ---------------------------------------------------------------------------

  async save(userId: string, offerId: string): Promise<void> {
    const offer = await this.offers.getVisibleById(offerId);
    if (offer.availability === 'EXPIRED') {
      throw new AppError(ErrorCode.CONFLICT, HttpStatus.CONFLICT, 'This offer has ended and cannot be saved');
    }
    const inserted = await this.db
      .insert(savedOffers)
      .values({ userId, offerId, businessId: offer.business.id })
      .onConflictDoNothing()
      .returning({ offerId: savedOffers.offerId });
    if (inserted.length) await this.record('OFFER_SAVED', offer.business.id, offerId, userId);
  }

  async unsave(userId: string, offerId: string): Promise<void> {
    await this.db.delete(savedOffers).where(and(eq(savedOffers.userId, userId), eq(savedOffers.offerId, offerId)));
  }

  async savedIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: savedOffers.offerId })
      .from(savedOffers)
      .where(eq(savedOffers.userId, userId))
      .orderBy(desc(savedOffers.createdAt))
      .limit(SAVED_LIST_CAP);
    return rows.map((r) => r.id);
  }

  /**
   * Saved offers that are still visible. "active" = live or paused; "ended" = expired (spec §23:
   * expired offers must not appear among active saved results). Suspended or hidden ones are skipped.
   */
  async listSaved(userId: string, status: 'active' | 'ended', query: PageQuery): Promise<Page<SavedOfferView>> {
    const rows = await this.db
      .select({ offerId: savedOffers.offerId, savedAt: savedOffers.createdAt })
      .from(savedOffers)
      .where(eq(savedOffers.userId, userId))
      .orderBy(desc(savedOffers.createdAt))
      .limit(SAVED_LIST_CAP);
    const savedAt = new Map(rows.map((r) => [r.offerId, r.savedAt]));
    const views = await this.offers.visibleByIds(rows.map((r) => r.offerId));
    const wanted = views.filter((v) => (status === 'ended' ? v.availability === 'EXPIRED' : v.availability !== 'EXPIRED'));
    const start = (query.page - 1) * query.pageSize;
    return new Page(
      wanted.slice(start, start + query.pageSize).map((v) => ({ ...v, savedAt: savedAt.get(v.id)! })),
      query,
      wanted.length,
    );
  }

  // ---- Followed businesses --------------------------------------------------------------------

  async follow(userId: string, businessId: string): Promise<void> {
    const business = await this.businesses.getPublicById(businessId);
    const inserted = await this.db
      .insert(businessFollowers)
      .values({ userId, businessId: business.id })
      .onConflictDoNothing()
      .returning({ businessId: businessFollowers.businessId });
    if (inserted.length) await this.record('BUSINESS_FOLLOWED', business.id, null, userId);
  }

  async unfollow(userId: string, businessId: string): Promise<void> {
    await this.db
      .delete(businessFollowers)
      .where(and(eq(businessFollowers.userId, userId), eq(businessFollowers.businessId, businessId)));
  }

  async followedIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: businessFollowers.businessId })
      .from(businessFollowers)
      .where(eq(businessFollowers.userId, userId))
      .orderBy(desc(businessFollowers.createdAt))
      .limit(SAVED_LIST_CAP);
    return rows.map((r) => r.id);
  }

  async listFollowing(userId: string): Promise<PublicBusinessView[]> {
    return this.businesses.publicViewsByIds(await this.followedIds(userId));
  }

  /** Live offers from the businesses this user follows (home section "From shops you follow"). */
  async followingFeed(userId: string, query: PageQuery): Promise<Page<PublicOfferView>> {
    return this.offers.liveForBusinesses(await this.followedIds(userId), query);
  }

  /** Who follows a business (for "a shop you follow posted an offer"). */
  async followerIds(businessId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: businessFollowers.userId })
      .from(businessFollowers)
      .where(eq(businessFollowers.businessId, businessId));
    return rows.map((r) => r.userId);
  }

  /** Who saved each of these offers (for "a saved offer ends soon"). */
  async saverIdsByOffer(offerIds: string[]): Promise<Map<string, string[]>> {
    if (offerIds.length === 0) return new Map();
    const rows = await this.db
      .select({ offerId: savedOffers.offerId, userId: savedOffers.userId })
      .from(savedOffers)
      .where(inArray(savedOffers.offerId, offerIds));
    const map = new Map<string, string[]>();
    for (const r of rows) map.set(r.offerId, [...(map.get(r.offerId) ?? []), r.userId]);
    return map;
  }

  // ---- Taps ------------------------------------------------------------------------------------

  /**
   * Records a page view or a share/contact tap on an offer or a business page, by anyone
   * (owner decision 2026-10-08). The same person or visitor doing the same thing again within
   * 30 minutes counts once. Anonymous requests that look like bots are ignored, and so are views
   * by the shop's own staff and by admins. Views never store who viewed (ADR-0017).
   * Always succeeds silently for skipped events, so the website never needs to care.
   */
  async track(actor: Actor, type: TrackableEvent, target: { offerId?: string; businessId?: string }): Promise<void> {
    const who = actor.userId ? `u:${actor.userId}` : actor.visitorId ? `v:${actor.visitorId}` : null;
    if (!who) throw AppError.validation({ visitorId: 'A visitor id is required when not logged in' });
    await this.rateLimiter.consume(`evt:${who}`, EVENTS_PER_USER_PER_HOUR, 3600);

    let businessId: string;
    let offerId: string | null = null;
    if (target.offerId && type !== 'BUSINESS_VIEWED') {
      const offer = await this.offers.getVisibleById(target.offerId);
      businessId = offer.business.id;
      offerId = offer.id;
    } else if (target.businessId && type !== 'OFFER_SHARED' && type !== 'OFFER_VIEWED') {
      businessId = (await this.businesses.getPublicById(target.businessId)).id;
    } else {
      throw AppError.validation(
        type === 'BUSINESS_VIEWED'
          ? { businessId: 'A business is required for this event' }
          : { offerId: 'An offer is required for this event' },
      );
    }

    if (!actor.userId && isLikelyBot(actor.userAgent)) return;
    const isView = VIEW_EVENTS.has(type);
    if (isView && actor.userId) {
      if (actor.isAdmin) return;
      if ((await this.businesses.memberUserIds(businessId)).includes(actor.userId)) return;
    }

    const first = await this.redis.set(`evt:dedupe:${who}:${type}:${offerId ?? businessId}`, '1', 'EX', DEDUPE_SECONDS, 'NX');
    if (!first) return;
    if (!actor.userId) {
      const perIp = await this.rateLimiter.hit(`evt:ip:${hashIp(actor.ip, this.config.OTP_HASH_SECRET)}`, ANONYMOUS_EVENTS_PER_IP_PER_HOUR, 3600);
      if (!perIp.allowed) return;
    }
    await this.record(type, businessId, offerId, isView ? null : (actor.userId ?? null));
  }

  /** Raw events older than the retention period are deleted by the worker (180 days, ADR-0017). */
  async purgeEventsBefore(cutoff: Date): Promise<number> {
    const deleted = await this.db
      .delete(analyticsEvents)
      .where(lt(analyticsEvents.createdAt, cutoff))
      .returning({ id: analyticsEvents.id });
    return deleted.length;
  }

  // ---- Business dashboard ------------------------------------------------------------------------

  /** Simple totals for the business dashboard (Phase 7 adds charts and date ranges). */
  async businessEngagement(userId: string, businessId: string): Promise<BusinessEngagement> {
    await this.businesses.getManaged(userId, businessId); // 404 unless the user manages it

    const [followers] = await this.db
      .select({ value: count() })
      .from(businessFollowers)
      .where(eq(businessFollowers.businessId, businessId));
    const saves = await this.db
      .select({ offerId: savedOffers.offerId, value: count() })
      .from(savedOffers)
      .where(eq(savedOffers.businessId, businessId))
      .groupBy(savedOffers.offerId);
    const events = await this.db
      .select({ offerId: analyticsEvents.offerId, type: analyticsEvents.type, value: count() })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.businessId, businessId),
          inArray(analyticsEvents.type, Object.keys(EVENT_FIELD) as AnalyticsEventType[]),
        ),
      )
      .groupBy(analyticsEvents.offerId, analyticsEvents.type);

    const totals = emptyCounts();
    const perOffer = new Map<string, EngagementCounts>();
    const forOffer = (id: string) => perOffer.get(id) ?? perOffer.set(id, emptyCounts()).get(id)!;
    for (const s of saves) {
      totals.saves += s.value;
      forOffer(s.offerId).saves += s.value;
    }
    for (const e of events) {
      const field = EVENT_FIELD[e.type]!;
      totals[field] += e.value;
      if (e.offerId) forOffer(e.offerId)[field] += e.value;
    }
    const titles = await this.offerReader.labelsFor([...perOffer.keys()]);
    const offers = [...perOffer.entries()]
      .filter(([id]) => titles.has(id))
      .map(([offerId, counts]) => ({ offerId, title: titles.get(offerId)!, ...counts }))
      .sort((a, b) => b.saves + b.shares - (a.saves + a.shares));
    return { followers: followers?.value ?? 0, totals, offers };
  }

  private async record(type: AnalyticsEventType, businessId: string, offerId: string | null, userId: string | null) {
    await this.db.insert(analyticsEvents).values({ type, businessId, offerId, userId });
  }
}
