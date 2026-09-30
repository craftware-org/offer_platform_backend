import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, ne } from 'drizzle-orm';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { offsetOf, Page, type PageQuery } from '../../common/http/pagination.js';
import { normalizePhone } from '../../common/phone/phone.js';
import { slugify, withRandomSuffix } from '../../common/text/slug.js';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';
import { DB, type Database, type Executor } from '../../infrastructure/database/database.module.js';
import { isUniqueViolation } from '../../infrastructure/database/pg-errors.js';
import { Role } from '../access-control/access-control.catalog.js';
import { AccessControlService } from '../access-control/access-control.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { CategoriesService } from '../categories/categories.service.js';
import { LocationsService } from '../locations/locations.service.js';
import type { CreateBusinessInput, UpdateBusinessInput } from './business.dto.js';
import { BusinessReader } from './business-reader.js';
import { isLockedForOwner, LOCKED_FIELDS, nextBusinessStatus } from './business-status.machine.js';
import {
  toOwnerView,
  toPublicView,
  type OwnerBusinessView,
  type PublicBusinessView,
} from './business-views.js';
import { businessLocations, businesses, businessStaff, type BusinessRow } from './businesses.schema.js';

/** Guard against spam registrations; a real chain with more shops can be raised by an admin later. */
export const MAX_BUSINESSES_PER_OWNER = 5;

export interface PublicBusinessQuery extends PageQuery {
  city?: string;
  locality?: string;
  category?: string;
}

interface Actor {
  userId: string;
  requestId?: string;
}

@Injectable()
export class BusinessesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly reader: BusinessReader,
    private readonly categories: CategoriesService,
    private readonly locations: LocationsService,
    private readonly accessControl: AccessControlService,
    private readonly audit: AuditService,
  ) {}

  // ---- Owner -------------------------------------------------------------------------------

  async register(input: CreateBusinessInput, actor: Actor): Promise<OwnerBusinessView> {
    const id = await this.withSlugRetry(() =>
      this.db.transaction(async (tx) => {
        const [owned] = await tx
          .select({ value: count() })
          .from(businesses)
          .where(eq(businesses.ownerUserId, actor.userId));
        if ((owned?.value ?? 0) >= MAX_BUSINESSES_PER_OWNER) {
          throw AppError.conflict(`You can register up to ${MAX_BUSINESSES_PER_OWNER} businesses`);
        }

        await this.categories.assertAssignable(input.categoryId, tx);
        const point = { latitude: input.location.latitude, longitude: input.location.longitude };
        const { city } = await this.locations.resolveAddress(
          { cityId: input.location.cityId, localityId: input.location.localityId, point },
          tx,
        );

        const [created] = await tx
          .insert(businesses)
          .values({
            ownerUserId: actor.userId,
            name: input.name,
            slug: await this.uniqueSlug(input.name, city.slug, tx),
            description: input.description ?? null,
            categoryId: input.categoryId,
            ...this.contactFields(input),
            socialLinks: input.socialLinks ?? {},
            registrationNumber: input.registrationNumber ?? null,
          })
          .returning({ id: businesses.id });
        if (!created) throw new Error('Insert returned no row');

        await tx.insert(businessLocations).values({
          businessId: created.id,
          addressLine1: input.location.addressLine1,
          addressLine2: input.location.addressLine2 ?? null,
          localityId: input.location.localityId ?? null,
          cityId: input.location.cityId,
          postalCode: input.location.postalCode ?? null,
          location: point,
          openingHours: input.openingHours ?? null,
        });
        await tx
          .insert(businessStaff)
          .values({ businessId: created.id, userId: actor.userId, role: 'OWNER' });
        await this.accessControl.grantRole(actor.userId, Role.BUSINESS_OWNER, null, tx);
        await this.audit.record(
          {
            actorUserId: actor.userId,
            action: AuditAction.BUSINESS_REGISTERED,
            entityType: 'business',
            entityId: created.id,
            newValue: { name: input.name, categoryId: input.categoryId, cityId: input.location.cityId },
            requestId: actor.requestId,
          },
          tx,
        );
        return created.id;
      }),
    );
    return this.getManaged(actor.userId, id);
  }

  async listManaged(userId: string): Promise<OwnerBusinessView[]> {
    const rows = await this.db
      .select({ id: businessStaff.businessId })
      .from(businessStaff)
      .innerJoin(businesses, eq(businesses.id, businessStaff.businessId))
      .where(eq(businessStaff.userId, userId))
      .orderBy(desc(businesses.createdAt));
    const bundles = await this.reader.bundles(rows.map((r) => r.id));
    return Promise.all(bundles.map(async (b) => toOwnerView(b, await this.reader.checklist(b))));
  }

  async getManaged(userId: string, businessId: string): Promise<OwnerBusinessView> {
    await this.reader.findManaged(userId, businessId);
    const bundle = await this.reader.bundle(businessId);
    return toOwnerView(bundle, await this.reader.checklist(bundle));
  }

  async updateManaged(
    userId: string,
    businessId: string,
    patch: UpdateBusinessInput,
  ): Promise<OwnerBusinessView> {
    await this.withSlugRetry(() =>
      this.db.transaction(async (tx) => {
        const business = await this.reader.findManaged(userId, businessId, tx);
        if (business.status === 'SUSPENDED') throw AppError.forbidden('This business is suspended');
        if (isLockedForOwner(business.status)) {
          const touched = LOCKED_FIELDS.filter((f) => patch[f] !== undefined);
          if (touched.length > 0) {
            throw new AppError(
              ErrorCode.FIELDS_LOCKED,
              HttpStatus.CONFLICT,
              'These details are locked while under review or after verification. Ask an admin to change them.',
              Object.fromEntries(touched.map((f) => [f, 'Locked'])),
            );
          }
        }
        await this.applyUpdate(business, patch, tx);
      }),
    );
    return this.getManaged(userId, businessId);
  }

  /** Owner asks for verification. Allowed from PENDING or REJECTED once the checklist is complete. */
  async submitForVerification(actor: Actor, businessId: string): Promise<OwnerBusinessView> {
    await this.db.transaction(async (tx) => {
      const business = await this.reader.findManaged(actor.userId, businessId, tx);
      const next = nextBusinessStatus(business.status, 'SUBMIT', { wasVerified: !!business.verifiedAt });
      const checklist = await this.reader.checklist(await this.reader.bundle(businessId, tx));
      if (!checklist.complete) {
        const missing = checklist.items.filter((i) => i.required && !i.done);
        throw AppError.validation(
          Object.fromEntries(missing.map((i) => [i.key, `Required: ${i.label}`])),
          'Complete the verification checklist before submitting',
        );
      }
      await tx
        .update(businesses)
        .set({ status: next, submittedAt: new Date(), statusReason: null })
        .where(eq(businesses.id, businessId));
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: AuditAction.BUSINESS_SUBMITTED_FOR_VERIFICATION,
          entityType: 'business',
          entityId: businessId,
          oldValue: { status: business.status },
          newValue: { status: next },
          requestId: actor.requestId,
        },
        tx,
      );
    });
    return this.getManaged(actor.userId, businessId);
  }

  async dashboard(userId: string, businessId: string) {
    const view = await this.getManaged(userId, businessId);
    return {
      business: {
        id: view.id,
        name: view.name,
        slug: view.slug,
        status: view.status,
        statusReason: view.statusReason,
        isVerified: view.isVerified,
        submittedAt: view.submittedAt,
        verifiedAt: view.verifiedAt,
        /** Public page path once verified; null while not publicly visible. */
        publicPath: view.isVerified ? `/businesses/${view.slug}` : null,
      },
      verification: view.verification,
      canSubmit: (view.status === 'PENDING' || view.status === 'REJECTED') && view.verification.complete,
      profile: {
        hasLogo: view.logo !== null,
        galleryPhotos: view.gallery.length,
        hasDescription: !!view.description,
        hasOpeningHours: view.openingHours !== null,
      },
    };
  }

  // ---- Public ------------------------------------------------------------------------------

  async getPublic(slug: string): Promise<PublicBusinessView> {
    const [row] = await this.db
      .select({ id: businesses.id })
      .from(businesses)
      .where(and(eq(businesses.slug, slug), eq(businesses.status, 'VERIFIED')));
    if (!row) throw AppError.notFound('Business');
    return toPublicView(await this.reader.bundle(row.id));
  }

  async listPublic(query: PublicBusinessQuery): Promise<Page<PublicBusinessView>> {
    const filters = [eq(businesses.status, 'VERIFIED'), eq(businessLocations.isPrimary, true)];
    if (query.city) {
      const city = await this.locations.getCityBySlug(query.city);
      filters.push(eq(businessLocations.cityId, city.id));
      if (query.locality) {
        const locality = await this.locations.getLocalityBySlug(city.id, query.locality);
        filters.push(eq(businessLocations.localityId, locality.id));
      }
    }
    if (query.category)
      filters.push(inArray(businesses.categoryId, await this.categories.idsForSlug(query.category)));
    const where = and(...filters);

    const [rows, [total]] = await Promise.all([
      this.db
        .select({ id: businesses.id })
        .from(businesses)
        .innerJoin(businessLocations, eq(businessLocations.businessId, businesses.id))
        .where(where)
        .orderBy(desc(businesses.verifiedAt), desc(businesses.id))
        .limit(query.pageSize)
        .offset(offsetOf(query)),
      this.db
        .select({ value: count() })
        .from(businesses)
        .innerJoin(businessLocations, eq(businessLocations.businessId, businesses.id))
        .where(where),
    ]);
    const bundles = await this.reader.bundles(rows.map((r) => r.id));
    return new Page(
      bundles.map((b) => toPublicView(b)),
      query,
      total?.value ?? 0,
    );
  }

  // ---- Shared with admin moderation ----------------------------------------------------------

  /** Applies a validated patch. Lock rules are enforced by the caller (owners), not here (admins). */
  async applyUpdate(business: BusinessRow, patch: UpdateBusinessInput, tx: Executor): Promise<void> {
    const set: Partial<typeof businesses.$inferInsert> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.email !== undefined) set.email = patch.email;
    if (patch.website !== undefined) set.website = patch.website;
    if (patch.socialLinks !== undefined) set.socialLinks = patch.socialLinks;
    if (patch.registrationNumber !== undefined) set.registrationNumber = patch.registrationNumber;
    const country = this.config.DEFAULT_PHONE_COUNTRY;
    if (patch.phone !== undefined) set.phone = normalizePhone(patch.phone, country, 'phone');
    if (patch.whatsapp !== undefined) {
      set.whatsapp = patch.whatsapp ? normalizePhone(patch.whatsapp, country, 'whatsapp') : null;
    }
    if (patch.categoryId !== undefined) {
      await this.categories.assertAssignable(patch.categoryId, tx);
      set.categoryId = patch.categoryId;
    }

    let citySlug: string | undefined;
    if (patch.location) {
      const point = { latitude: patch.location.latitude, longitude: patch.location.longitude };
      const { city } = await this.locations.resolveAddress(
        { cityId: patch.location.cityId, localityId: patch.location.localityId, point },
        tx,
      );
      citySlug = city.slug;
      await tx
        .update(businessLocations)
        .set({
          addressLine1: patch.location.addressLine1,
          addressLine2: patch.location.addressLine2 ?? null,
          localityId: patch.location.localityId ?? null,
          cityId: patch.location.cityId,
          postalCode: patch.location.postalCode ?? null,
          location: point,
        })
        .where(and(eq(businessLocations.businessId, business.id), eq(businessLocations.isPrimary, true)));
    }
    if (patch.openingHours !== undefined) {
      await tx
        .update(businessLocations)
        .set({ openingHours: patch.openingHours })
        .where(and(eq(businessLocations.businessId, business.id), eq(businessLocations.isPrimary, true)));
    }

    // Keep the public URL stable once the business has been public; before that, follow the name.
    const neverPublic = business.verifiedAt === null;
    if (neverPublic && (patch.name !== undefined || citySlug !== undefined)) {
      citySlug ??= (await this.reader.bundle(business.id, tx)).city.slug;
      set.slug = await this.uniqueSlug(patch.name ?? business.name, citySlug, tx, business.id);
    }

    if (Object.keys(set).length > 0) {
      await tx.update(businesses).set(set).where(eq(businesses.id, business.id));
    }
  }

  private contactFields(input: { phone: string; whatsapp?: string | null }) {
    const country = this.config.DEFAULT_PHONE_COUNTRY;
    return {
      phone: normalizePhone(input.phone, country, 'phone'),
      whatsapp: input.whatsapp ? normalizePhone(input.whatsapp, country, 'whatsapp') : null,
    };
  }

  /** "sri-ganesh-textiles-hubballi", or with a random suffix if already taken. */
  private async uniqueSlug(
    name: string,
    citySlug: string,
    db: Executor,
    excludeId?: string,
  ): Promise<string> {
    const base = `${slugify(name, 'business').slice(0, 80)}-${citySlug}`.slice(0, 95);
    for (const candidate of [base, withRandomSuffix(base), withRandomSuffix(base), withRandomSuffix(base)]) {
      const [taken] = await db
        .select({ id: businesses.id })
        .from(businesses)
        .where(
          excludeId
            ? and(eq(businesses.slug, candidate), ne(businesses.id, excludeId))
            : eq(businesses.slug, candidate),
        );
      if (!taken) return candidate;
    }
    throw AppError.conflict('Could not create a unique web address for this business, please retry');
  }

  /** Two registrations racing for the same slug: the loser gets a clean retryable error. */
  private async withSlugRetry<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isUniqueViolation(error, 'businesses_slug_key')) {
        throw AppError.conflict('Another business just took this name, please retry');
      }
      throw error;
    }
  }
}
