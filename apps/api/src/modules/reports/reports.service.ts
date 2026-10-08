import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, inArray } from 'drizzle-orm';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { offsetOf, Page, type PageQuery } from '../../common/http/pagination.js';
import { DB, type Database } from '../../infrastructure/database/database.module.js';
import { isUniqueViolation } from '../../infrastructure/database/pg-errors.js';
import { RateLimiterService } from '../../infrastructure/redis/rate-limiter.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { BusinessModerationService } from '../businesses/business-moderation.service.js';
import { BusinessReader } from '../businesses/business-reader.js';
import { BusinessesService } from '../businesses/businesses.service.js';
import { OfferModerationService } from '../offers/offer-moderation.service.js';
import { OfferReader } from '../offers/offer-reader.js';
import { OffersPublicService } from '../offers/offers-public.service.js';
import { UsersService } from '../users/users.service.js';
import {
  reportActions,
  reports,
  type ReportActionType,
  type ReportReason,
  type ReportStatus,
} from './reports.schema.js';

interface Actor {
  userId: string;
  requestId?: string;
}

export interface AdminReportView {
  id: string;
  status: ReportStatus;
  reason: ReportReason;
  note: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  offer: { id: string; title: string | null };
  business: { id: string; name: string | null };
  reporter: { id: string; name: string } | null;
  /** Open reports on the same offer, including this one (a quick signal of how serious it is). */
  openReportsOnOffer: number;
  actions?: { action: ReportActionType; note: string | null; at: Date; by: string | null }[];
}

export interface BusinessWarning {
  at: Date;
  message: string;
  reason: ReportReason;
  offer: { id: string; title: string | null };
}

/** Reports per person per day; well above honest use. */
const REPORTS_PER_USER_PER_DAY = 20;
/** How long warnings stay on the business dashboard. */
const WARNING_DAYS = 180;

/**
 * Customer reports and admin decisions (Phase 5, spec §21, §27). Suspensions reuse the offer and
 * business moderation services, so their rules, reasons and audit entries apply unchanged.
 */
@Injectable()
export class ReportsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly rateLimiter: RateLimiterService,
    private readonly audit: AuditService,
    private readonly offers: OffersPublicService,
    private readonly offerReader: OfferReader,
    private readonly offerModeration: OfferModerationService,
    private readonly businesses: BusinessesService,
    private readonly businessReader: BusinessReader,
    private readonly businessModeration: BusinessModerationService,
    private readonly users: UsersService,
  ) {}

  // ---- Customers ------------------------------------------------------------------------------

  async create(userId: string, offerId: string, input: { reason: ReportReason; note?: string }) {
    await this.rateLimiter.consume(`report:user:${userId}`, REPORTS_PER_USER_PER_DAY, 86_400);
    const offer = await this.offers.getVisibleById(offerId);
    try {
      const [row] = await this.db
        .insert(reports)
        .values({
          offerId: offer.id,
          businessId: offer.business.id,
          reporterUserId: userId,
          reason: input.reason,
          note: input.note?.trim() || null,
        })
        .returning({ id: reports.id, status: reports.status });
      return row!;
    } catch (error) {
      if (isUniqueViolation(error, 'reports_one_open_per_reporter_key')) {
        throw AppError.conflict('You have already reported this offer. Our team is looking into it.');
      }
      throw error;
    }
  }

  // ---- Businesses -----------------------------------------------------------------------------

  /** Warnings an admin sent about this business's offers (shown on its dashboard). */
  async warningsForBusiness(userId: string, businessId: string): Promise<BusinessWarning[]> {
    await this.businesses.getManaged(userId, businessId); // 404 unless the user manages it
    const since = new Date(Date.now() - WARNING_DAYS * 86_400_000);
    const rows = await this.db
      .select({
        at: reportActions.createdAt,
        message: reportActions.note,
        reason: reports.reason,
        offerId: reports.offerId,
      })
      .from(reportActions)
      .innerJoin(reports, eq(reports.id, reportActions.reportId))
      .where(
        and(
          eq(reports.businessId, businessId),
          eq(reportActions.action, 'WARN_BUSINESS'),
          gte(reportActions.createdAt, since),
        ),
      )
      .orderBy(desc(reportActions.createdAt));
    const titles = await this.offerReader.labelsFor([...new Set(rows.map((r) => r.offerId))]);
    return rows.map((r) => ({
      at: r.at,
      message: r.message ?? '',
      reason: r.reason,
      offer: { id: r.offerId, title: titles.get(r.offerId) ?? null },
    }));
  }

  // ---- Admins ---------------------------------------------------------------------------------

  async list(query: PageQuery & { status?: ReportStatus }): Promise<Page<AdminReportView>> {
    const where = query.status ? eq(reports.status, query.status) : undefined;
    // The open queue is first-come, first-served; history is newest first.
    const order = query.status === 'OPEN' ? [asc(reports.createdAt)] : [desc(reports.createdAt)];
    const rows = await this.db
      .select()
      .from(reports)
      .where(where)
      .orderBy(...order, asc(reports.id))
      .limit(query.pageSize)
      .offset(offsetOf(query));
    const [total] = await this.db.select({ value: count() }).from(reports).where(where);
    return new Page(await this.views(rows), query, total?.value ?? 0);
  }

  async get(reportId: string): Promise<AdminReportView> {
    const [row] = await this.db.select().from(reports).where(eq(reports.id, reportId));
    if (!row) throw AppError.notFound('Report');
    const [view] = await this.views([row]);
    const actions = await this.db
      .select()
      .from(reportActions)
      .where(eq(reportActions.reportId, reportId))
      .orderBy(asc(reportActions.createdAt));
    const actorNames = await this.users.labelsFor(
      [...new Set(actions.flatMap((a) => (a.actorUserId ? [a.actorUserId] : [])))],
    );
    return {
      ...view!,
      actions: actions.map((a) => ({
        action: a.action,
        note: a.note,
        at: a.createdAt,
        by: a.actorUserId ? (actorNames.get(a.actorUserId) ?? null) : null,
      })),
    };
  }

  /**
   * An admin's decision on an OPEN report.
   * - DISMISS: closes this report (no problem found).
   * - WARN_BUSINESS: the note is the message the business sees on its dashboard; closes this report.
   * - SUSPEND_OFFER / SUSPEND_BUSINESS: suspends through the existing moderation (same reasons and
   *   audit), then closes every open report on that offer / business, since they are now handled.
   */
  async act(reportId: string, action: ReportActionType, note: string | undefined, actor: Actor) {
    const [report] = await this.db.select().from(reports).where(eq(reports.id, reportId));
    if (!report) throw AppError.notFound('Report');
    if (report.status !== 'OPEN') {
      throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION, HttpStatus.CONFLICT, 'This report is already closed');
    }
    const reason = note?.trim() || undefined;
    if (action !== 'DISMISS' && !reason) throw AppError.validation({ note: 'A message is required for this action' });

    if (action === 'SUSPEND_OFFER') {
      await this.offerModeration.moderate(report.offerId, { action: 'SUSPEND', reason: reason! }, actor);
    } else if (action === 'SUSPEND_BUSINESS') {
      await this.businessModeration.changeStatus(report.businessId, 'SUSPEND', reason, actor);
    }

    await this.db.transaction(async (tx) => {
      const scope =
        action === 'SUSPEND_OFFER'
          ? eq(reports.offerId, report.offerId)
          : action === 'SUSPEND_BUSINESS'
            ? eq(reports.businessId, report.businessId)
            : eq(reports.id, report.id);
      const closed = await tx
        .update(reports)
        .set({
          status: action === 'DISMISS' ? 'DISMISSED' : 'RESOLVED',
          resolvedAt: new Date(),
          resolvedBy: actor.userId,
        })
        .where(and(scope, eq(reports.status, 'OPEN')))
        .returning({ id: reports.id });
      for (const { id } of closed) {
        await tx.insert(reportActions).values({
          reportId: id,
          actorUserId: actor.userId,
          action,
          note: id === report.id ? (reason ?? null) : `Closed together with report ${report.id}`,
        });
      }
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action:
            action === 'DISMISS'
              ? AuditAction.REPORT_DISMISSED
              : action === 'WARN_BUSINESS'
                ? AuditAction.BUSINESS_WARNED
                : AuditAction.REPORT_RESOLVED,
          entityType: action === 'WARN_BUSINESS' ? 'business' : 'report',
          entityId: action === 'WARN_BUSINESS' ? report.businessId : report.id,
          newValue: { action, reportId: report.id, closedReports: closed.length, ...(reason ? { reason } : {}) },
          requestId: actor.requestId,
        },
        tx,
      );
    });
    return this.get(reportId);
  }

  /** Display names for the admin activity feed: the reported offer's title. */
  async labelsFor(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ id: reports.id, offerId: reports.offerId })
      .from(reports)
      .where(inArray(reports.id, ids));
    const titles = await this.offerReader.labelsFor([...new Set(rows.map((r) => r.offerId))]);
    return new Map(rows.flatMap((r) => (titles.has(r.offerId) ? [[r.id, titles.get(r.offerId)!] as const] : [])));
  }

  private async views(rows: (typeof reports.$inferSelect)[]): Promise<AdminReportView[]> {
    if (rows.length === 0) return [];
    const offerIds = [...new Set(rows.map((r) => r.offerId))];
    const titles = await this.offerReader.labelsFor(offerIds);
    const names = await this.businessReader.labelsFor([...new Set(rows.map((r) => r.businessId))]);
    const reporters = await this.users.labelsFor([
      ...new Set(rows.flatMap((r) => (r.reporterUserId ? [r.reporterUserId] : []))),
    ]);
    const openCounts = await this.db
      .select({ offerId: reports.offerId, value: count() })
      .from(reports)
      .where(and(inArray(reports.offerId, offerIds), eq(reports.status, 'OPEN')))
      .groupBy(reports.offerId);
    const open = new Map(openCounts.map((c) => [c.offerId, c.value]));
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      reason: r.reason,
      note: r.note,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      offer: { id: r.offerId, title: titles.get(r.offerId) ?? null },
      business: { id: r.businessId, name: names.get(r.businessId) ?? null },
      reporter: r.reporterUserId
        ? { id: r.reporterUserId, name: reporters.get(r.reporterUserId) ?? 'Unknown user' }
        : null,
      openReportsOnOffer: open.get(r.offerId) ?? 0,
    }));
  }
}

