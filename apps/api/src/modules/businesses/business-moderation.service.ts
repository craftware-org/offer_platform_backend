import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { AppError } from '../../common/errors/app-error.js';
import { escapeLike } from '../../common/text/like.js';
import { offsetOf, Page, type PageQuery } from '../../common/http/pagination.js';
import { DB, type Database } from '../../infrastructure/database/database.module.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { UpdateBusinessInput } from './business.dto.js';
import { BusinessReader } from './business-reader.js';
import { nextBusinessStatus } from './business-status.machine.js';
import { toAdminView, type AdminBusinessView } from './business-views.js';
import { businessLocations, businesses, type BusinessStatus } from './businesses.schema.js';
import { BusinessesService } from './businesses.service.js';

export type AdminStatusAction = 'VERIFY' | 'REJECT' | 'SUSPEND' | 'REACTIVATE';

export interface AdminBusinessQuery extends PageQuery {
  status?: BusinessStatus;
  search?: string;
  cityId?: string;
  categoryId?: string;
}

interface Actor {
  userId: string;
  requestId?: string;
}

const AUDIT_FOR: Record<AdminStatusAction, AuditAction> = {
  VERIFY: AuditAction.BUSINESS_VERIFIED,
  REJECT: AuditAction.BUSINESS_REJECTED,
  SUSPEND: AuditAction.BUSINESS_SUSPENDED,
  REACTIVATE: AuditAction.BUSINESS_REACTIVATED,
};

/** Admin side of the verification workflow. */
@Injectable()
export class BusinessModerationService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly reader: BusinessReader,
    private readonly businessesService: BusinessesService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AdminBusinessQuery): Promise<Page<AdminBusinessView>> {
    const filters: SQL[] = [eq(businessLocations.isPrimary, true)];
    if (query.status) filters.push(eq(businesses.status, query.status));
    if (query.cityId) filters.push(eq(businessLocations.cityId, query.cityId));
    if (query.categoryId) filters.push(eq(businesses.categoryId, query.categoryId));
    if (query.search) {
      const term = `%${escapeLike(query.search)}%`;
      const match = or(
        ilike(businesses.name, term),
        ilike(businesses.slug, term),
        ilike(businesses.phone, term),
        ilike(businesses.registrationNumber, term),
      );
      if (match) filters.push(match);
    }
    const where = and(...filters);
    // The review queue is first-come, first-served; every other list shows newest first.
    const order =
      query.status === 'UNDER_REVIEW'
        ? [asc(businesses.submittedAt), asc(businesses.id)]
        : [desc(businesses.createdAt), desc(businesses.id)];

    const [rows, [total]] = await Promise.all([
      this.db
        .select({ id: businesses.id })
        .from(businesses)
        .innerJoin(businessLocations, eq(businessLocations.businessId, businesses.id))
        .where(where)
        .orderBy(...order)
        .limit(query.pageSize)
        .offset(offsetOf(query)),
      this.db
        .select({ value: count() })
        .from(businesses)
        .innerJoin(businessLocations, eq(businessLocations.businessId, businesses.id))
        .where(where),
    ]);
    const bundles = await this.reader.bundles(rows.map((r) => r.id));
    const views = await Promise.all(bundles.map(async (b) => toAdminView(b, await this.reader.checklist(b))));
    return new Page(views, query, total?.value ?? 0);
  }

  async get(businessId: string): Promise<AdminBusinessView> {
    const bundle = await this.reader.bundle(businessId);
    return toAdminView(bundle, await this.reader.checklist(bundle));
  }

  async changeStatus(
    businessId: string,
    action: AdminStatusAction,
    reason: string | undefined,
    actor: Actor,
  ): Promise<AdminBusinessView> {
    await this.db.transaction(async (tx) => {
      const [business] = await tx
        .select()
        .from(businesses)
        .where(eq(businesses.id, businessId))
        .for('update');
      if (!business) throw AppError.notFound('Business');
      if (action === 'VERIFY' && (await this.reader.isMember(actor.userId, businessId, tx))) {
        throw AppError.forbidden('You cannot verify a business you own or manage');
      }

      const next = nextBusinessStatus(business.status, action, { wasVerified: business.verifiedAt !== null });
      const set: Partial<typeof businesses.$inferInsert> = {
        status: next,
        statusReason: action === 'REJECT' || action === 'SUSPEND' ? (reason ?? null) : null,
      };
      if (action === 'VERIFY') {
        set.verifiedAt = new Date();
        set.verifiedBy = actor.userId;
      }
      await tx.update(businesses).set(set).where(eq(businesses.id, businessId));
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: AUDIT_FOR[action],
          entityType: 'business',
          entityId: businessId,
          oldValue: { status: business.status },
          newValue: { status: next, ...(reason ? { reason } : {}) },
          requestId: actor.requestId,
        },
        tx,
      );
    });
    return this.get(businessId);
  }

  /** Admins may change any field, including those locked for the owner. Always audited. */
  async update(businessId: string, patch: UpdateBusinessInput, actor: Actor): Promise<AdminBusinessView> {
    await this.db.transaction(async (tx) => {
      const [business] = await tx
        .select()
        .from(businesses)
        .where(eq(businesses.id, businessId))
        .for('update');
      if (!business) throw AppError.notFound('Business');
      const before = await this.reader.bundle(businessId, tx);
      const previous: Record<string, unknown> = {
        ...business,
        openingHours: before.location.openingHours,
        location: {
          addressLine1: before.location.addressLine1,
          addressLine2: before.location.addressLine2,
          cityId: before.location.cityId,
          localityId: before.location.localityId,
          postalCode: before.location.postalCode,
          ...before.location.location,
        },
      };

      await this.businessesService.applyUpdate(business, patch, tx);
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: AuditAction.BUSINESS_UPDATED_BY_ADMIN,
          entityType: 'business',
          entityId: businessId,
          oldValue: Object.fromEntries(Object.keys(patch).map((k) => [k, previous[k]])),
          newValue: patch,
          requestId: actor.requestId,
        },
        tx,
      );
    });
    return this.get(businessId);
  }
}
