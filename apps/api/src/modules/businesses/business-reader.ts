import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { AppError } from '../../common/errors/app-error.js';
import { DB, type Database, type Executor } from '../../infrastructure/database/database.module.js';
import { CategoriesService } from '../categories/categories.service.js';
import { LocationsService } from '../locations/locations.service.js';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service.js';
import type { BusinessBundle } from './business-views.js';
import {
  businessImages,
  businessLocations,
  businesses,
  businessStaff,
  type BusinessRow,
} from './businesses.schema.js';
import { verificationChecklist, type VerificationChecklist } from './verification-checklist.js';

/** Loads businesses with everything needed to render them, using one query per table. */
@Injectable()
export class BusinessReader {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly categories: CategoriesService,
    private readonly locations: LocationsService,
    private readonly settings: PlatformSettingsService,
  ) {}

  /**
   * Bundles in the same order as `ids`; unknown ids are skipped.
   * Queries run one after another on purpose: `db` may be a transaction, i.e. a single
   * connection, which must not receive concurrent queries.
   */
  async bundles(ids: string[], db: Executor = this.db): Promise<BusinessBundle[]> {
    if (ids.length === 0) return [];
    const rows = await db.select().from(businesses).where(inArray(businesses.id, ids));
    const locationRows = await db
      .select()
      .from(businessLocations)
      .where(and(inArray(businessLocations.businessId, ids), eq(businessLocations.isPrimary, true)));
    const imageRows = await db
      .select()
      .from(businessImages)
      .where(inArray(businessImages.businessId, ids))
      .orderBy(asc(businessImages.sortOrder), asc(businessImages.createdAt));

    const categoryMap = await this.categories.getMany([...new Set(rows.map((r) => r.categoryId))]);
    const places = await this.locations.lookup(
      [...new Set(locationRows.map((l) => l.cityId))],
      [...new Set(locationRows.flatMap((l) => (l.localityId ? [l.localityId] : [])))],
      db,
    );

    const byId = new Map(rows.map((r) => [r.id, r]));
    const locationByBusiness = new Map(locationRows.map((l) => [l.businessId, l]));
    return ids.flatMap((id) => {
      const business = byId.get(id);
      const location = locationByBusiness.get(id);
      if (!business || !location) return [];
      const city = places.cities.get(location.cityId);
      const category = categoryMap.get(business.categoryId);
      if (!city || !category) throw new Error(`Business ${id} references a missing city or category`);
      return [
        {
          business,
          location,
          city,
          locality: location.localityId ? (places.localities.get(location.localityId) ?? null) : null,
          category,
          images: imageRows.filter((i) => i.businessId === id),
        },
      ];
    });
  }

  async bundle(id: string, db: Executor = this.db): Promise<BusinessBundle> {
    const [found] = await this.bundles([id], db);
    if (!found) throw AppError.notFound('Business');
    return found;
  }

  /**
   * The business if `userId` is its owner or staff. Otherwise 404, never 403, so that
   * other people's business ids cannot be probed.
   */
  async findManaged(userId: string, businessId: string, db: Executor = this.db): Promise<BusinessRow> {
    const [row] = await db
      .select({ business: businesses })
      .from(businesses)
      .innerJoin(
        businessStaff,
        and(eq(businessStaff.businessId, businesses.id), eq(businessStaff.userId, userId)),
      )
      .where(eq(businesses.id, businessId));
    if (!row) throw AppError.notFound('Business');
    return row.business;
  }

  async isMember(userId: string, businessId: string, db: Executor = this.db): Promise<boolean> {
    const [row] = await db
      .select({ userId: businessStaff.userId })
      .from(businessStaff)
      .where(and(eq(businessStaff.businessId, businessId), eq(businessStaff.userId, userId)));
    return !!row;
  }

  async checklist(bundle: BusinessBundle): Promise<VerificationChecklist> {
    const requirements = await this.settings.get('business.verification');
    return verificationChecklist(requirements, {
      shopPhotos: bundle.images.filter((i) => i.kind === 'VERIFICATION_SHOP').length,
      ownerPhotos: bundle.images.filter((i) => i.kind === 'VERIFICATION_OWNER').length,
      registrationNumber: bundle.business.registrationNumber,
    });
  }
}
