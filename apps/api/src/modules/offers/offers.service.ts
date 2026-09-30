import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, desc, eq, ne } from 'drizzle-orm';
import { AppError } from '../../common/errors/app-error.js';
import { offsetOf, Page, type PageQuery } from '../../common/http/pagination.js';
import { slugify, withRandomSuffix } from '../../common/text/slug.js';
import { DB, type Database, type Executor } from '../../infrastructure/database/database.module.js';
import { isUniqueViolation } from '../../infrastructure/database/pg-errors.js';
import { StorageProvider } from '../../infrastructure/storage/storage.module.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { BusinessReader } from '../businesses/business-reader.js';
import type { BusinessRow } from '../businesses/businesses.schema.js';
import { CategoriesService } from '../categories/categories.service.js';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service.js';
import type { CreateOfferInput, UpdateOfferInput } from './offer.dto.js';
import { assertReadyForReview } from './offer-checks.js';
import { OfferReader } from './offer-reader.js';
import {
  EDITABLE_STATUSES,
  LIVE_STATUSES,
  nextOfferStatus,
  type OfferAction,
} from './offer-status.machine.js';
import { pricingOf, toOwnerOfferView, type OwnerOfferView } from './offer-views.js';
import { offerPriceHistory, offers, offerStatus, type OfferRow, type OfferStatus } from './offers.schema.js';
import { normalizePricing, pricingSnapshot, samePricing, type OfferPricing } from './pricing.js';

interface Actor {
  userId: string;
  requestId?: string;
}

export const BUSINESS_OFFER_ACTIONS = ['SUBMIT', 'WITHDRAW', 'PAUSE', 'RESUME', 'END'] as const;
export type BusinessOfferAction = (typeof BUSINESS_OFFER_ACTIONS)[number] & OfferAction;

const BUSINESS_ACTION_AUDIT: Record<BusinessOfferAction, AuditAction> = {
  SUBMIT: AuditAction.OFFER_SUBMITTED,
  WITHDRAW: AuditAction.OFFER_WITHDRAWN,
  PAUSE: AuditAction.OFFER_PAUSED,
  RESUME: AuditAction.OFFER_RESUMED,
  END: AuditAction.OFFER_ENDED,
};

const pricingColumns = (p: OfferPricing) => ({
  type: p.type,
  originalPrice: p.originalPrice,
  offerPrice: p.offerPrice,
  discountPercent: p.discountPercent,
  isUpTo: p.isUpTo,
  maxDiscountAmount: p.maxDiscountAmount,
  flatAmountOff: p.flatAmountOff,
  minPurchaseAmount: p.minPurchaseAmount,
  buyQuantity: p.buyQuantity,
  getQuantity: p.getQuantity,
  itemName: p.itemName,
  comboItems: p.comboItems,
});

/** Business side of offers: everything an owner/staff member does with their offers. */
@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly reader: OfferReader,
    private readonly businesses: BusinessReader,
    private readonly categories: CategoriesService,
    private readonly settings: PlatformSettingsService,
    private readonly audit: AuditService,
    private readonly storage: StorageProvider,
  ) {}

  /** Creates a DRAFT. Drafts are allowed before the business is verified; submitting is not. */
  async create(actor: Actor, businessId: string, input: CreateOfferInput): Promise<OwnerOfferView> {
    const id = await this.uniquely(() =>
      this.db.transaction(async (tx) => {
        const business = await this.businesses.findManaged(actor.userId, businessId, tx);
        if (business.status === 'SUSPENDED') throw AppError.forbidden('This business is suspended');
        await this.categories.assertAssignable(input.categoryId, tx);
        const pricing = normalizePricing(input.pricing);

        const [created] = await tx
          .insert(offers)
          .values({
            businessId,
            slug: await this.uniqueSlug(input.title, tx),
            title: input.title,
            description: input.description ?? null,
            categoryId: input.categoryId,
            ...pricingColumns(pricing),
            startsAt: input.startsAt,
            expiresAt: input.expiresAt,
            terms: input.terms ?? null,
            eligibility: input.eligibility ?? null,
            quantityLimit: input.quantityLimit ?? null,
            createdBy: actor.userId,
          })
          .returning({ id: offers.id });
        if (!created) throw new Error('Insert returned no row');
        await this.recordPrice(tx, created.id, pricing, 'CREATED', actor.userId);
        await this.auditOffer(tx, actor, AuditAction.OFFER_CREATED, created.id, undefined, {
          businessId,
          type: pricing.type,
          title: input.title,
        });
        return created.id;
      }),
    );
    return this.get(actor.userId, id);
  }

  async listForBusiness(
    userId: string,
    businessId: string,
    query: PageQuery & { status?: OfferStatus },
  ): Promise<Page<OwnerOfferView>> {
    await this.businesses.findManaged(userId, businessId);
    const where = query.status
      ? and(eq(offers.businessId, businessId), eq(offers.status, query.status))
      : eq(offers.businessId, businessId);
    const [rows, [total]] = await Promise.all([
      this.db
        .select({ id: offers.id })
        .from(offers)
        .where(where)
        .orderBy(desc(offers.createdAt), desc(offers.id))
        .limit(query.pageSize)
        .offset(offsetOf(query)),
      this.db.select({ value: count() }).from(offers).where(where),
    ]);
    const now = new Date();
    const bundles = await this.reader.bundles(rows.map((r) => r.id));
    return new Page(
      bundles.map((b) => toOwnerOfferView(b, now)),
      query,
      total?.value ?? 0,
    );
  }

  /** Counts per status for the business dashboard ("Active offers: 4"). */
  async summary(userId: string, businessId: string): Promise<Record<OfferStatus, number>> {
    await this.businesses.findManaged(userId, businessId);
    const rows = await this.db
      .select({ status: offers.status, value: count() })
      .from(offers)
      .where(eq(offers.businessId, businessId))
      .groupBy(offers.status);
    const counts = Object.fromEntries(offerStatus.enumValues.map((s) => [s, 0])) as Record<
      OfferStatus,
      number
    >;
    for (const r of rows) counts[r.status] = r.value;
    return counts;
  }

  async get(userId: string, offerId: string): Promise<OwnerOfferView> {
    await this.reader.findManaged(userId, offerId);
    return toOwnerOfferView(await this.reader.bundle(offerId), new Date());
  }

  /**
   * Edits content. Editing an approved (scheduled/live) offer sends it back to admin review,
   * and it stays hidden from customers until approved again.
   */
  async update(actor: Actor, offerId: string, patch: UpdateOfferInput): Promise<OwnerOfferView> {
    await this.uniquely(() =>
      this.db.transaction(async (tx) => {
        const { offer, business } = await this.reader.findManaged(actor.userId, offerId, tx, true);
        this.assertEditable(offer, business);

        const startsAt = patch.startsAt ?? offer.startsAt;
        const expiresAt = patch.expiresAt ?? offer.expiresAt;
        if (startsAt >= expiresAt)
          throw AppError.validation({ expiresAt: 'The offer must end after it starts' });
        if (patch.categoryId !== undefined) await this.categories.assertAssignable(patch.categoryId, tx);

        const set: Partial<typeof offers.$inferInsert> = {};
        for (const key of [
          'title',
          'description',
          'categoryId',
          'terms',
          'eligibility',
          'quantityLimit',
        ] as const) {
          if (patch[key] !== undefined) (set as Record<string, unknown>)[key] = patch[key];
        }
        if (patch.startsAt) set.startsAt = patch.startsAt;
        if (patch.expiresAt) set.expiresAt = patch.expiresAt;
        if (patch.title !== undefined && offer.firstPublishedAt === null) {
          set.slug = await this.uniqueSlug(patch.title, tx, offer.id);
        }

        if (patch.pricing) {
          const next = normalizePricing(patch.pricing);
          Object.assign(set, pricingColumns(next));
          // History records price changes only (item names or combo contents alone are not prices).
          if (!samePricing(next, pricingOf(offer))) {
            await this.recordPrice(tx, offer.id, next, 'UPDATED_BY_BUSINESS', actor.userId);
          }
        }

        await tx.update(offers).set(set).where(eq(offers.id, offer.id));
        await this.sendBackToReviewIfLive(
          tx,
          { ...offer, startsAt, expiresAt },
          business,
          actor,
          Object.keys(patch),
        );
      }),
    );
    return this.get(actor.userId, offerId);
  }

  /**
   * Called after any content change (fields or images). If the offer was approved,
   * it goes back to PENDING_REVIEW after the automated checks pass.
   */
  async sendBackToReviewIfLive(
    tx: Executor,
    offer: OfferRow,
    business: BusinessRow,
    actor: Actor,
    changed: string[],
  ): Promise<void> {
    if (!LIVE_STATUSES.includes(offer.status)) return;
    const limits = await this.settings.get('offers.limits');
    assertReadyForReview(offer, business, limits, new Date());
    await tx
      .update(offers)
      .set({ status: 'PENDING_REVIEW', submittedAt: new Date(), statusReason: null })
      .where(eq(offers.id, offer.id));
    await this.auditOffer(
      tx,
      actor,
      AuditAction.OFFER_EDITED_LIVE,
      offer.id,
      { status: offer.status },
      {
        status: 'PENDING_REVIEW',
        changed,
      },
    );
  }

  assertEditable(offer: OfferRow, business: BusinessRow): void {
    if (business.status === 'SUSPENDED') throw AppError.forbidden('This business is suspended');
    if (!EDITABLE_STATUSES.includes(offer.status)) {
      const hint = offer.status === 'PENDING_REVIEW' ? ' Withdraw it from review first.' : '';
      throw AppError.conflict(`An offer that is ${offer.status} cannot be edited.${hint}`);
    }
  }

  async act(actor: Actor, offerId: string, action: BusinessOfferAction): Promise<OwnerOfferView> {
    await this.db.transaction(async (tx) => {
      const { offer, business } = await this.reader.findManaged(actor.userId, offerId, tx, true);
      if (business.status === 'SUSPENDED') throw AppError.forbidden('This business is suspended');
      const now = new Date();
      const next = nextOfferStatus(offer.status, action, offer, now);
      const set: Partial<typeof offers.$inferInsert> = { status: next };

      if (action === 'SUBMIT') {
        assertReadyForReview(offer, business, await this.settings.get('offers.limits'), now);
        set.submittedAt = now;
        set.statusReason = null;
      }
      // Ending a running offer moves its end time to now (so it reads "ended <time>").
      if (action === 'END' && offer.startsAt < now && offer.expiresAt > now) set.expiresAt = now;

      await tx.update(offers).set(set).where(eq(offers.id, offer.id));
      await this.auditOffer(
        tx,
        actor,
        BUSINESS_ACTION_AUDIT[action],
        offer.id,
        { status: offer.status },
        { status: next },
      );
    });
    return this.get(actor.userId, offerId);
  }

  /** Only never-submitted drafts can be deleted. Everything else is kept for history (spec: no deleting offers). */
  async deleteDraft(actor: Actor, offerId: string): Promise<void> {
    const imagePrefixes = await this.db.transaction(async (tx) => {
      const { offer } = await this.reader.findManaged(actor.userId, offerId, tx, true);
      if (offer.status !== 'DRAFT' || offer.submittedAt !== null) {
        throw AppError.conflict('Only drafts that were never submitted can be deleted');
      }
      const bundle = await this.reader.bundle(offer.id, tx);
      await tx.delete(offers).where(eq(offers.id, offer.id));
      await this.auditOffer(
        tx,
        actor,
        AuditAction.OFFER_DELETED,
        offer.id,
        { title: offer.title },
        undefined,
      );
      return bundle.images.map((i) => i.storagePrefix);
    });
    for (const prefix of imagePrefixes) {
      await this.storage
        .deletePrefix(prefix)
        .catch((err: unknown) => this.logger.error({ err, prefix }, 'Image cleanup failed'));
    }
  }

  async priceHistory(userId: string, offerId: string) {
    await this.reader.findManaged(userId, offerId);
    return this.priceHistoryOf(offerId);
  }

  async priceHistoryOf(offerId: string) {
    return this.db
      .select()
      .from(offerPriceHistory)
      .where(eq(offerPriceHistory.offerId, offerId))
      .orderBy(desc(offerPriceHistory.recordedAt), desc(offerPriceHistory.id));
  }

  private async recordPrice(
    tx: Executor,
    offerId: string,
    pricing: OfferPricing,
    source: 'CREATED' | 'UPDATED_BY_BUSINESS',
    userId: string,
  ): Promise<void> {
    await tx.insert(offerPriceHistory).values({
      offerId,
      price: pricing.offerPrice,
      originalPrice: pricing.originalPrice,
      discountPercent: pricing.discountPercent,
      pricing: pricingSnapshot(pricing),
      source,
      changedBy: userId,
    });
  }

  private async auditOffer(
    tx: Executor,
    actor: Actor,
    action: AuditAction,
    offerId: string,
    oldValue: unknown,
    newValue: unknown,
  ): Promise<void> {
    await this.audit.record(
      {
        actorUserId: actor.userId,
        action,
        entityType: 'offer',
        entityId: offerId,
        oldValue,
        newValue,
        requestId: actor.requestId,
      },
      tx,
    );
  }

  /** "40-off-selected-mens-shirts-k2p9". A random suffix keeps slugs unique across businesses. */
  private async uniqueSlug(title: string, db: Executor, excludeId?: string): Promise<string> {
    const base = slugify(title, 'offer').slice(0, 85);
    for (let attempt = 0; attempt < 4; attempt++) {
      const candidate = withRandomSuffix(base);
      const [taken] = await db
        .select({ id: offers.id })
        .from(offers)
        .where(
          excludeId ? and(eq(offers.slug, candidate), ne(offers.id, excludeId)) : eq(offers.slug, candidate),
        );
      if (!taken) return candidate;
    }
    throw AppError.conflict('Could not create a unique web address for this offer, please retry');
  }

  private async uniquely<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isUniqueViolation(error, 'offers_slug_key')) throw AppError.conflict('Please retry');
      throw error;
    }
  }
}
