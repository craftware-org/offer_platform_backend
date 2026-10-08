import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { Page, type PageQuery } from '../../common/http/pagination.js';
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

/** Taps the website may record (Phase 5). Saves and follows are recorded by their own endpoints. */
export const TRACKABLE_EVENTS = [
  'OFFER_SHARED',
  'CALL_CLICKED',
  'WHATSAPP_CLICKED',
  'WEBSITE_CLICKED',
  'DIRECTIONS_CLICKED',
] as const;
export type TrackableEvent = (typeof TRACKABLE_EVENTS)[number];

/** The same person tapping the same thing again within this window counts once. */
const DEDUPE_SECONDS = 30 * 60;
/** Generous cap per person; real use is far below it. */
const EVENTS_PER_USER_PER_HOUR = 300;
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

  // ---- Taps ------------------------------------------------------------------------------------

  /**
   * Records a share or contact tap by a logged-in user on an offer or a business page.
   * Repeated taps on the same thing within 30 minutes count once. Always succeeds silently for
   * duplicates, so the website never needs to care.
   */
  async track(userId: string, type: TrackableEvent, target: { offerId?: string; businessId?: string }): Promise<void> {
    await this.rateLimiter.consume(`evt:user:${userId}`, EVENTS_PER_USER_PER_HOUR, 3600);
    let businessId: string;
    let offerId: string | null = null;
    if (target.offerId) {
      const offer = await this.offers.getVisibleById(target.offerId);
      businessId = offer.business.id;
      offerId = offer.id;
    } else if (target.businessId && type !== 'OFFER_SHARED') {
      businessId = (await this.businesses.getPublicById(target.businessId)).id;
    } else {
      throw AppError.validation({ offerId: 'An offer is required for this event' });
    }
    const first = await this.redis.set(
      `evt:dedupe:${userId}:${type}:${offerId ?? businessId}`,
      '1',
      'EX',
      DEDUPE_SECONDS,
      'NX',
    );
    if (first) await this.record(type, businessId, offerId, userId);
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

  private async record(type: AnalyticsEventType, businessId: string, offerId: string | null, userId: string) {
    await this.db.insert(analyticsEvents).values({ type, businessId, offerId, userId });
  }
}
