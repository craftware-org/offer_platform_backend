import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gt, inArray, lte, type SQL } from 'drizzle-orm';
import { AppError } from '../../common/errors/app-error.js';
import { offsetOf, Page, type PageQuery } from '../../common/http/pagination.js';
import { DB, type Database } from '../../infrastructure/database/database.module.js';
import { businessLocations, businesses } from '../businesses/businesses.schema.js';
import { CategoriesService } from '../categories/categories.service.js';
import { LocationsService } from '../locations/locations.service.js';
import { OfferReader } from './offer-reader.js';
import { PUBLIC_STATUSES } from './offer-status.machine.js';
import { toPublicOfferView, type PublicOfferView } from './offer-views.js';
import { offers } from './offers.schema.js';

export interface PublicOfferQuery extends PageQuery {
  city?: string;
  locality?: string;
  category?: string;
  business?: string;
}

/**
 * What customers can see. Reads business status and location read-only for visibility and
 * filtering (the same documented exception as the discovery module, ADR-0002).
 * "Live" is decided by status AND dates, so an offer disappears exactly at expiry even if the
 * worker is late.
 */
@Injectable()
export class OffersPublicService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly reader: OfferReader,
    private readonly categories: CategoriesService,
    private readonly locations: LocationsService,
  ) {}

  async list(query: PublicOfferQuery): Promise<Page<PublicOfferView>> {
    const now = new Date();
    const filters: SQL[] = [
      eq(offers.status, 'ACTIVE'),
      lte(offers.startsAt, now),
      gt(offers.expiresAt, now),
      eq(businesses.status, 'VERIFIED'),
      eq(businessLocations.isPrimary, true),
    ];
    if (query.city) {
      const city = await this.locations.getCityBySlug(query.city);
      filters.push(eq(businessLocations.cityId, city.id));
      if (query.locality) {
        const locality = await this.locations.getLocalityBySlug(city.id, query.locality);
        filters.push(eq(businessLocations.localityId, locality.id));
      }
    }
    if (query.category)
      filters.push(inArray(offers.categoryId, await this.categories.idsForSlug(query.category)));
    if (query.business) filters.push(eq(businesses.slug, query.business));
    const where = and(...filters);

    const base = () =>
      this.db
        .select({ id: offers.id })
        .from(offers)
        .innerJoin(businesses, eq(businesses.id, offers.businessId))
        .innerJoin(businessLocations, eq(businessLocations.businessId, businesses.id));
    const [rows, [total]] = await Promise.all([
      base()
        .where(where)
        .orderBy(desc(offers.approvedAt), desc(offers.id))
        .limit(query.pageSize)
        .offset(offsetOf(query)),
      this.db
        .select({ value: count() })
        .from(offers)
        .innerJoin(businesses, eq(businesses.id, offers.businessId))
        .innerJoin(businessLocations, eq(businessLocations.businessId, businesses.id))
        .where(where),
    ]);
    const bundles = await this.reader.bundles(rows.map((r) => r.id));
    return new Page(
      bundles.map((b) => toPublicOfferView(b, now)),
      query,
      total?.value ?? 0,
    );
  }

  /** Offer page. Expired offers stay reachable (shared links say "expired" instead of breaking). */
  async get(slug: string): Promise<PublicOfferView> {
    const [row] = await this.db
      .select({ id: offers.id })
      .from(offers)
      .innerJoin(businesses, eq(businesses.id, offers.businessId))
      .where(
        and(
          eq(offers.slug, slug),
          inArray(offers.status, [...PUBLIC_STATUSES]),
          eq(businesses.status, 'VERIFIED'),
        ),
      );
    if (!row) throw AppError.notFound('Offer');
    return toPublicOfferView(await this.reader.bundle(row.id), new Date());
  }
}
