import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { DB, type Database, type Executor } from '../../infrastructure/database/database.module.js';
import { BusinessReader } from '../businesses/business-reader.js';
import type { BusinessRow } from '../businesses/businesses.schema.js';
import { CategoriesService } from '../categories/categories.service.js';
import type { OfferBundle } from './offer-views.js';
import { offerImages, offers, type OfferRow } from './offers.schema.js';

/** Loads offers with images, category and business, one query per table (sequential: `db` may be a transaction). */
@Injectable()
export class OfferReader {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly businesses: BusinessReader,
    private readonly categories: CategoriesService,
  ) {}

  /** Offer titles by id, for admin activity feeds (missing ids are simply absent). */
  async labelsFor(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ id: offers.id, title: offers.title })
      .from(offers)
      .where(inArray(offers.id, ids));
    return new Map(rows.map((r) => [r.id, r.title]));
  }

  async bundles(ids: string[], db: Executor = this.db): Promise<OfferBundle[]> {
    if (ids.length === 0) return [];
    const rows = await db.select().from(offers).where(inArray(offers.id, ids));
    const images = await db
      .select()
      .from(offerImages)
      .where(inArray(offerImages.offerId, ids))
      .orderBy(asc(offerImages.sortOrder), asc(offerImages.createdAt));
    const categoryMap = await this.categories.getMany([...new Set(rows.map((r) => r.categoryId))]);
    const businessBundles = await this.businesses.bundles([...new Set(rows.map((r) => r.businessId))], db);
    const businessById = new Map(businessBundles.map((b) => [b.business.id, b]));
    const byId = new Map(rows.map((r) => [r.id, r]));

    return ids.flatMap((id) => {
      const offer = byId.get(id);
      if (!offer) return [];
      const category = categoryMap.get(offer.categoryId);
      const business = businessById.get(offer.businessId);
      if (!category || !business) throw new Error(`Offer ${id} references a missing category or business`);
      return [{ offer, category, business, images: images.filter((i) => i.offerId === id) }];
    });
  }

  async bundle(id: string, db: Executor = this.db): Promise<OfferBundle> {
    const [found] = await this.bundles([id], db);
    if (!found) throw AppError.notFound('Offer');
    return found;
  }

  /** The offer and its business if `userId` manages that business; otherwise 404 (never 403). */
  async findManaged(
    userId: string,
    offerId: string,
    db: Executor = this.db,
    lock = false,
  ): Promise<{ offer: OfferRow; business: BusinessRow }> {
    const query = db.select().from(offers).where(eq(offers.id, offerId));
    const [offer] = lock ? await query.for('update') : await query;
    if (!offer) throw AppError.notFound('Offer');
    try {
      const business = await this.businesses.findManaged(userId, offer.businessId, db);
      return { offer, business };
    } catch (error) {
      // Not a member of the business: report the OFFER as not found (don't reveal it exists).
      if (error instanceof AppError && error.code === ErrorCode.NOT_FOUND) throw AppError.notFound('Offer');
      throw error;
    }
  }
}
