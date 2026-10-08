import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DomainEvents } from '../../infrastructure/events/domain-events.js';
import { and, asc, count, desc, eq, ilike, type SQL } from 'drizzle-orm';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { offsetOf, Page, type PageQuery } from '../../common/http/pagination.js';
import { escapeLike } from '../../common/text/like.js';
import { DB, type Database } from '../../infrastructure/database/database.module.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { BusinessReader } from '../businesses/business-reader.js';
import { OfferReader } from './offer-reader.js';
import { nextOfferStatus } from './offer-status.machine.js';
import { toAdminOfferView, type AdminOfferView } from './offer-views.js';
import { offers, type OfferStatus } from './offers.schema.js';
import type { OfferModerationInput } from './offer.dto.js';

export interface AdminOfferQuery extends PageQuery {
  status?: OfferStatus;
  businessId?: string;
  search?: string;
}

const AUDIT_FOR: Record<OfferModerationInput['action'], AuditAction> = {
  APPROVE: AuditAction.OFFER_APPROVED,
  REJECT: AuditAction.OFFER_REJECTED,
  REQUEST_CHANGES: AuditAction.OFFER_CHANGES_REQUESTED,
  SUSPEND: AuditAction.OFFER_SUSPENDED,
  REACTIVATE: AuditAction.OFFER_REACTIVATED,
};

/** Admin side: every offer is reviewed before customers can see it. */
@Injectable()
export class OfferModerationService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly reader: OfferReader,
    private readonly businesses: BusinessReader,
    private readonly audit: AuditService,
    private readonly events: DomainEvents,
  ) {}

  async list(query: AdminOfferQuery): Promise<Page<AdminOfferView>> {
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(offers.status, query.status));
    if (query.businessId) filters.push(eq(offers.businessId, query.businessId));
    if (query.search) filters.push(ilike(offers.title, `%${escapeLike(query.search)}%`));
    const where = filters.length ? and(...filters) : undefined;
    // The review queue is first-come, first-served.
    const order =
      query.status === 'PENDING_REVIEW'
        ? [asc(offers.submittedAt), asc(offers.id)]
        : [desc(offers.updatedAt), desc(offers.id)];

    const [rows, [total]] = await Promise.all([
      this.db
        .select({ id: offers.id })
        .from(offers)
        .where(where)
        .orderBy(...order)
        .limit(query.pageSize)
        .offset(offsetOf(query)),
      this.db.select({ value: count() }).from(offers).where(where),
    ]);
    const now = new Date();
    const bundles = await this.reader.bundles(rows.map((r) => r.id));
    return new Page(
      bundles.map((b) => toAdminOfferView(b, now)),
      query,
      total?.value ?? 0,
    );
  }

  async get(offerId: string): Promise<AdminOfferView> {
    return toAdminOfferView(await this.reader.bundle(offerId), new Date());
  }

  async moderate(
    offerId: string,
    input: OfferModerationInput,
    actor: { userId: string; requestId?: string },
  ): Promise<AdminOfferView> {
    let newStatus = '';
    await this.db.transaction(async (tx) => {
      const [offer] = await tx.select().from(offers).where(eq(offers.id, offerId)).for('update');
      if (!offer) throw AppError.notFound('Offer');
      const { business } = await this.reader.bundle(offerId, tx);

      if (input.action === 'APPROVE' || input.action === 'REACTIVATE') {
        if (business.business.status !== 'VERIFIED') {
          throw new AppError(
            ErrorCode.BUSINESS_NOT_VERIFIED,
            HttpStatus.CONFLICT,
            `The business is ${business.business.status}; its offers cannot go live`,
          );
        }
        if (await this.businesses.isMember(actor.userId, offer.businessId, tx)) {
          throw AppError.forbidden('You cannot approve offers of a business you own or manage');
        }
      }

      const now = new Date();
      const next = nextOfferStatus(offer.status, input.action, offer, now);
      newStatus = next;
      const set: Partial<typeof offers.$inferInsert> = {
        status: next,
        statusReason: ['REJECT', 'REQUEST_CHANGES', 'SUSPEND'].includes(input.action)
          ? (input.reason ?? null)
          : null,
      };
      if (input.action === 'APPROVE') {
        set.approvedAt = now;
        set.approvedBy = actor.userId;
        set.firstPublishedAt = offer.firstPublishedAt ?? now; // the slug is frozen from here on
      }
      await tx.update(offers).set(set).where(eq(offers.id, offerId));
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: AUDIT_FOR[input.action],
          entityType: 'offer',
          entityId: offerId,
          oldValue: { status: offer.status },
          newValue: { status: next, ...(input.reason ? { reason: input.reason } : {}) },
          requestId: actor.requestId,
        },
        tx,
      );
    });
    // Announced after commit (ADR-0016); notifications react, failures never undo the decision.
    await this.events.emit('offer.moderated', {
      offerId,
      action: input.action,
      status: newStatus,
      reason: input.reason ?? null,
    });
    if (newStatus === 'ACTIVE' && (input.action === 'APPROVE' || input.action === 'REACTIVATE')) {
      await this.events.emit('offer.went_live', { offerIds: [offerId] });
    }
    return this.get(offerId);
  }
}
