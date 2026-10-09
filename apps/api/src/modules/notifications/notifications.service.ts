import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../common/errors/app-error.js';
import { Page, offsetOf, type PageQuery } from '../../common/http/pagination.js';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';
import { DB, type Database, type Executor } from '../../infrastructure/database/database.module.js';
import { EmailProvider } from '../../infrastructure/email/email.module.js';
import { DomainEvents } from '../../infrastructure/events/domain-events.js';
import { Role } from '../access-control/access-control.catalog.js';
import { AccessControlService } from '../access-control/access-control.service.js';
import { BusinessModerationService } from '../businesses/business-moderation.service.js';
import { BusinessReader } from '../businesses/business-reader.js';
import { BusinessesService } from '../businesses/businesses.service.js';
import { EngagementService } from '../engagement/engagement.service.js';
import { OfferModerationService } from '../offers/offer-moderation.service.js';
import { OfferReader } from '../offers/offer-reader.js';
import { ReportsService } from '../reports/reports.service.js';
import { UsersService } from '../users/users.service.js';
import {
  CATALOG,
  customerEmailNotBefore,
  defaultChannels,
  NOTIFICATION_TYPES,
  type Channels,
  type NotificationType,
} from './notification-catalog.js';
import { notificationPreferences, notifications } from './notifications.schema.js';

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: Date;
}

export interface PreferenceView extends Channels {
  type: NotificationType;
  audience: string;
  label: string;
  defaults: Channels;
}

interface Message {
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  /** Unique per person: the same key is never notified twice. */
  dedupeKey?: string;
}

const MAX_EMAIL_ATTEMPTS = 3;
const OUTBOX_BATCH = 50;
const RETRY_DELAY_MS = 5 * 60_000;

const OFFER_ACTION_TYPE: Record<string, NotificationType | undefined> = {
  APPROVE: 'OFFER_APPROVED',
  REJECT: 'OFFER_REJECTED',
  REQUEST_CHANGES: 'OFFER_CHANGES_REQUESTED',
  SUSPEND: 'OFFER_SUSPENDED',
};
const BUSINESS_ACTION_TYPE: Record<string, NotificationType | undefined> = {
  VERIFY: 'BUSINESS_VERIFIED',
  REJECT: 'BUSINESS_REJECTED',
  SUSPEND: 'BUSINESS_SUSPENDED',
  REACTIVATE: 'BUSINESS_REACTIVATED',
};

const istTime = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
const istDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Phase 6 notifications (spec §29, ADR-0016): reacts to domain events, writes the 🔔 inbox, and
 * queues emails in an outbox that the worker sends. Other modules are used only through their
 * exported services (ADR-0002); none of them depends on this module.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly unsubscribeKey: Buffer;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly events: DomainEvents,
    private readonly email: EmailProvider,
    private readonly users: UsersService,
    private readonly accessControl: AccessControlService,
    private readonly businesses: BusinessesService,
    private readonly businessReader: BusinessReader,
    private readonly businessModeration: BusinessModerationService,
    private readonly offerReader: OfferReader,
    private readonly offerModeration: OfferModerationService,
    private readonly engagement: EngagementService,
    private readonly reports: ReportsService,
  ) {
    // A separate key derived from an existing secret: unsubscribe links can't be forged.
    this.unsubscribeKey = createHmac('sha256', config.OTP_HASH_SECRET)
      .update('notifications-unsubscribe-v1')
      .digest();
  }

  onModuleInit(): void {
    this.events.on('business.status_changed', (e) => this.onBusinessStatus(e));
    this.events.on('business.warned', (e) => this.onBusinessWarned(e));
    this.events.on('offer.moderated', (e) => this.onOfferModerated(e));
    this.events.on('offer.went_live', (e) => this.onOffersLive(e.offerIds));
  }

  // ---- Event handlers -----------------------------------------------------------------------

  private async onBusinessStatus(e: {
    businessId: string;
    action: string;
    status: string;
    reason: string | null;
  }) {
    const type = BUSINESS_ACTION_TYPE[e.action];
    if (!type) return;
    const name = (await this.businessReader.labelsFor([e.businessId])).get(e.businessId) ?? 'Your business';
    const text: Record<string, [string, string]> = {
      BUSINESS_VERIFIED: [
        `“${name}” is verified`,
        'Customers can now find your shop, and you can publish offers.',
      ],
      BUSINESS_REJECTED: [
        `Verification of “${name}” was not approved`,
        `Reason: ${e.reason ?? 'not given'}. Update the details and submit again.`,
      ],
      BUSINESS_SUSPENDED: [
        `“${name}” has been suspended`,
        `Reason: ${e.reason ?? 'not given'}. It is hidden from customers until reactivated.`,
      ],
      BUSINESS_REACTIVATED: [`“${name}” is active again`, 'Your shop is back on the platform.'],
    };
    const [title, body] = text[type]!;
    await this.notify(await this.businesses.memberUserIds(e.businessId), {
      type,
      title,
      body,
      link: `/business/${e.businessId}`,
    });
  }

  private async onBusinessWarned(e: { businessId: string; offerId: string; message: string }) {
    const [offer] = await this.offerReader.summaries([e.offerId]);
    await this.notify(await this.businesses.memberUserIds(e.businessId), {
      type: 'BUSINESS_WARNED',
      title: `A warning about your offer “${offer?.title ?? 'offer'}”`,
      body: e.message,
      link: `/business/${e.businessId}`,
    });
  }

  private async onOfferModerated(e: {
    offerId: string;
    action: string;
    status: string;
    reason: string | null;
  }) {
    const type = OFFER_ACTION_TYPE[e.action];
    if (!type) return;
    const [offer] = await this.offerReader.summaries([e.offerId]);
    if (!offer) return;
    const reason = `Reason: ${e.reason ?? 'not given'}.`;
    const text: Record<string, [string, string]> = {
      OFFER_APPROVED: [
        `Your offer “${offer.title}” is approved`,
        e.status === 'SCHEDULED'
          ? 'It goes live automatically at its start time.'
          : 'It is now live for customers.',
      ],
      OFFER_REJECTED: [`Your offer “${offer.title}” was rejected`, reason],
      OFFER_CHANGES_REQUESTED: [
        `Changes requested to “${offer.title}”`,
        `${reason} Edit the offer and submit it again.`,
      ],
      OFFER_SUSPENDED: [
        `Your offer “${offer.title}” was suspended`,
        `${reason} It is hidden from customers.`,
      ],
    };
    const [title, body] = text[type]!;
    await this.notify(await this.businesses.memberUserIds(offer.businessId), {
      type,
      title,
      body,
      link: `/business/offers/${offer.id}`,
    });
  }

  /** Followers hear about each live offer once (re-activations don't repeat it). */
  private async onOffersLive(offerIds: string[]) {
    const offers = await this.offerReader.summaries(offerIds);
    const names = await this.businessReader.labelsFor([...new Set(offers.map((o) => o.businessId))]);
    for (const offer of offers) {
      const followers = await this.engagement.followerIds(offer.businessId);
      await this.notify(followers, {
        type: 'FOLLOWED_SHOP_NEW_OFFER',
        title: `New offer from ${names.get(offer.businessId) ?? 'a shop you follow'}`,
        body: offer.title,
        link: `/offers/${offer.slug}`,
        dedupeKey: `offer-live:${offer.id}`,
      });
    }
  }

  // ---- Scheduled scans (worker) --------------------------------------------------------------

  /** Offers ending within 24 hours: tell their business and the people who saved them (once). */
  async notifyEndingSoon(now = new Date()): Promise<number> {
    const ending = await this.offerReader.endingWithin(now, new Date(now.getTime() + 86_400_000));
    if (ending.length === 0) return 0;
    const savers = await this.engagement.saverIdsByOffer(ending.map((o) => o.id));
    const names = await this.businessReader.labelsFor([...new Set(ending.map((o) => o.businessId))]);
    let sent = 0;
    for (const offer of ending) {
      const when = istTime(offer.expiresAt);
      sent += await this.notify(await this.businesses.memberUserIds(offer.businessId), {
        type: 'OFFER_ENDING_SOON',
        title: `“${offer.title}” ends within a day`,
        body: `It ends on ${when}. Publish a new offer to keep customers coming.`,
        link: `/business/offers/${offer.id}`,
        dedupeKey: `offer-ending:${offer.id}`,
      });
      sent += await this.notify(savers.get(offer.id) ?? [], {
        type: 'SAVED_OFFER_ENDING',
        title: `A saved offer ends soon: “${offer.title}”`,
        body: `${names.get(offer.businessId) ?? 'The shop'} · ends on ${when}.`,
        link: `/offers/${offer.slug}`,
        dedupeKey: `offer-ending:${offer.id}`,
      });
    }
    return sent;
  }

  /** One summary per day for admins, only when something is waiting. */
  async sendAdminDailySummary(now = new Date()): Promise<number> {
    const page = { page: 1, pageSize: 1 };
    const businesses = (await this.businessModeration.list({ ...page, status: 'UNDER_REVIEW' })).meta
      .totalItems;
    const offers = (await this.offerModeration.list({ ...page, status: 'PENDING_REVIEW' })).meta.totalItems;
    const reports = (await this.reports.list({ ...page, status: 'OPEN' })).meta.totalItems;
    if (businesses + offers + reports === 0) return 0;
    const admins = await this.accessControl.userIdsWithRoles([Role.ADMIN, Role.SUPER_ADMIN]);
    return this.notify(admins, {
      type: 'ADMIN_DAILY_SUMMARY',
      title: `Waiting for review: ${businesses} business${businesses === 1 ? '' : 'es'}, ${offers} offer${offers === 1 ? '' : 's'}, ${reports} report${reports === 1 ? '' : 's'}`,
      body: 'Open the admin area to review them (oldest first).',
      link: '/admin',
      dedupeKey: `admin-summary:${istDate(now)}`,
    });
  }

  // ---- Creating notifications ----------------------------------------------------------------

  /**
   * Writes one inbox entry per person, following their preferences. Emails go to the outbox
   * (verified addresses only); customer emails wait out quiet hours. Returns how many were created.
   */
  async notify(userIds: string[], message: Message, now = new Date()): Promise<number> {
    const recipients = [...(await this.users.activeIds([...new Set(userIds)]))];
    if (recipients.length === 0) return 0;
    const prefs = await this.channelsFor(recipients, message.type);
    const emails = await this.users.verifiedEmails(recipients);
    const customer = CATALOG[message.type].audience === 'CUSTOMER';

    let created = 0;
    for (const userId of recipients) {
      const channels = prefs.get(userId)!;
      const sendEmail = channels.email && emails.has(userId);
      if (!channels.inApp && !sendEmail) continue;
      const inserted = await this.db
        .insert(notifications)
        .values({
          userId,
          type: message.type,
          title: message.title.slice(0, 200),
          body: message.body.slice(0, 1000),
          link: message.link,
          dedupeKey: message.dedupeKey ?? null,
          inApp: channels.inApp,
          emailStatus: sendEmail ? 'PENDING' : 'NONE',
          emailNotBefore: sendEmail ? (customer ? customerEmailNotBefore(now) : now) : null,
        })
        .onConflictDoNothing()
        .returning({ id: notifications.id });
      created += inserted.length;
    }
    return created;
  }

  private async channelsFor(userIds: string[], type: NotificationType): Promise<Map<string, Channels>> {
    const rows = await this.db
      .select()
      .from(notificationPreferences)
      .where(and(inArray(notificationPreferences.userId, userIds), eq(notificationPreferences.type, type)));
    const saved = new Map(rows.map((r) => [r.userId, { inApp: r.inApp, email: r.email }]));
    return new Map(userIds.map((id) => [id, saved.get(id) ?? defaultChannels(type)]));
  }

  // ---- Inbox ---------------------------------------------------------------------------------

  async list(userId: string, query: PageQuery): Promise<Page<NotificationView>> {
    const where = and(eq(notifications.userId, userId), eq(notifications.inApp, true));
    const rows = await this.db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(query.pageSize)
      .offset(offsetOf(query));
    const [total] = await this.db.select({ value: count() }).from(notifications).where(where);
    const unread = await this.unreadCount(userId);
    return new Page(
      rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        link: r.link,
        read: r.readAt !== null,
        createdAt: r.createdAt,
      })),
      query,
      total?.value ?? 0,
      { unread },
    );
  }

  async unreadCount(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), eq(notifications.inApp, true), isNull(notifications.readAt)),
      );
    return row?.value ?? 0;
  }

  /** Marks the given notifications (or all of them) as read. Only the owner's rows are touched. */
  async markRead(userId: string, ids: string[] | 'all'): Promise<void> {
    const mine = and(eq(notifications.userId, userId), isNull(notifications.readAt));
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(ids === 'all' ? mine : and(mine, inArray(notifications.id, ids)));
  }

  // ---- Preferences ---------------------------------------------------------------------------

  /** The types that apply to this person: customer types always; business types if they manage one; admin if admin. */
  async preferences(userId: string, isAdmin: boolean): Promise<PreferenceView[]> {
    const managesBusiness = (await this.businesses.listManaged(userId)).length > 0;
    const rows = await this.db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));
    const saved = new Map(rows.map((r) => [r.type, { inApp: r.inApp, email: r.email }]));
    return NOTIFICATION_TYPES.filter((t) => {
      const audience = CATALOG[t].audience;
      return (
        audience === 'CUSTOMER' ||
        (audience === 'BUSINESS' && managesBusiness) ||
        (audience === 'ADMIN' && isAdmin)
      );
    }).map((type) => ({
      type,
      audience: CATALOG[type].audience,
      label: CATALOG[type].label,
      defaults: defaultChannels(type),
      ...(saved.get(type) ?? defaultChannels(type)),
    }));
  }

  async setPreference(userId: string, type: NotificationType, channels: Channels): Promise<void> {
    await this.db
      .insert(notificationPreferences)
      .values({ userId, type, ...channels })
      .onConflictDoUpdate({
        target: [notificationPreferences.userId, notificationPreferences.type],
        set: channels,
      });
  }

  // ---- One-click unsubscribe -----------------------------------------------------------------

  unsubscribeToken(userId: string, type: NotificationType): string {
    const payload = Buffer.from(`${userId}:${type}`).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  /** Turns email off for that one type. Works without logging in (the link in the email). */
  async unsubscribe(token: string): Promise<{ type: NotificationType; label: string }> {
    const [payload, signature] = token.split('.');
    const expected = payload ? this.sign(payload) : '';
    const valid =
      !!payload &&
      !!signature &&
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) throw AppError.validation({ token: 'This unsubscribe link is not valid' });
    const [userId, type] = Buffer.from(payload!, 'base64url').toString().split(':') as [
      string,
      NotificationType,
    ];
    if (!NOTIFICATION_TYPES.includes(type))
      throw AppError.validation({ token: 'This unsubscribe link is not valid' });
    const current = (await this.channelsFor([userId], type)).get(userId)!;
    await this.setPreference(userId, type, { inApp: current.inApp, email: false });
    return { type, label: CATALOG[type].label };
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.unsubscribeKey).update(payload).digest('base64url');
  }

  // ---- Personal data (Phase 8) ---------------------------------------------------------------

  /** Account deletion: the inbox and the notification settings go. */
  async forgetUser(userId: string, tx: Executor): Promise<void> {
    await tx.delete(notifications).where(eq(notifications.userId, userId));
    await tx.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  }

  /** Retention (owner decision 2026-10-09: 1 year): older notifications are deleted, read or not. */
  async purgeBefore(cutoff: Date): Promise<number> {
    const rows = await this.db
      .delete(notifications)
      .where(lt(notifications.createdAt, cutoff))
      .returning({ id: notifications.id });
    return rows.length;
  }

  // ---- Email outbox (worker) -----------------------------------------------------------------

  /**
   * Sends due emails. Rows are claimed with FOR UPDATE SKIP LOCKED, so several workers never send
   * the same email; failures are retried (up to 3 tries, 5 minutes apart) and then marked FAILED.
   */
  async sendPendingEmails(now = new Date()): Promise<{ sent: number; failed: number }> {
    const claimed = await this.db.execute<{
      id: string;
      user_id: string;
      type: NotificationType;
      title: string;
      body: string;
      link: string | null;
      email_attempts: number;
    }>(sql`
      UPDATE notifications SET email_status = 'SENDING', email_attempts = email_attempts + 1
      WHERE id IN (
        SELECT id FROM notifications
        WHERE email_status = 'PENDING' AND (email_not_before IS NULL OR email_not_before <= ${now})
        ORDER BY created_at
        LIMIT ${OUTBOX_BATCH}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, user_id, type, title, body, link, email_attempts`);
    const rows = claimed.rows;
    if (rows.length === 0) return { sent: 0, failed: 0 };

    const addresses = await this.users.verifiedEmails([...new Set(rows.map((r) => r.user_id))]);
    let sent = 0;
    let failed = 0;
    for (const row of rows) {
      const to = addresses.get(row.user_id);
      try {
        if (!to) throw new Error('No verified email address');
        await this.email.send({
          ...this.renderEmail(row.user_id, row.type, row.title, row.body, row.link, to.name),
          to: to.email,
        });
        await this.db
          .update(notifications)
          .set({ emailStatus: 'SENT', emailSentAt: new Date(), emailError: null })
          .where(eq(notifications.id, row.id));
        sent++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const giveUp = !to || row.email_attempts >= MAX_EMAIL_ATTEMPTS;
        await this.db
          .update(notifications)
          .set({
            emailStatus: giveUp ? 'FAILED' : 'PENDING',
            emailNotBefore: giveUp ? null : new Date(now.getTime() + RETRY_DELAY_MS * row.email_attempts),
            emailError: message.slice(0, 300),
          })
          .where(eq(notifications.id, row.id));
        if (giveUp) failed++;
        this.logger.warn(
          { notificationId: row.id, attempt: row.email_attempts, giveUp, error: message },
          'Notification email failed',
        );
      }
    }
    if (sent || failed) this.logger.log({ sent, failed }, 'Notification emails processed');
    return { sent, failed };
  }

  private renderEmail(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    link: string | null,
    name: string | null,
  ) {
    const base = this.config.APP_PUBLIC_URL.replace(/\/+$/, '');
    const brand = this.config.APP_DISPLAY_NAME;
    const open = link ? `${base}${link}` : base;
    const unsubscribe = `${base}/unsubscribe?token=${encodeURIComponent(this.unsubscribeToken(userId, type))}`;
    const manage = `${base}/account#notifications`;
    const greeting = name ? `Hi ${name},` : 'Hi,';
    const text = [
      greeting,
      '',
      title,
      body,
      '',
      `Open: ${open}`,
      '',
      `— ${brand}`,
      `Stop emails like this: ${unsubscribe}`,
      `Manage notifications: ${manage}`,
    ].join('\n');
    const html = `<p>${escapeHtml(greeting)}</p>
<p><strong>${escapeHtml(title)}</strong><br>${escapeHtml(body)}</p>
<p><a href="${escapeHtml(open)}">Open in ${escapeHtml(brand)}</a></p>
<hr><p style="font-size:12px;color:#666">You get this because of your notification settings.
<a href="${escapeHtml(unsubscribe)}">Stop emails like this</a> · <a href="${escapeHtml(manage)}">Manage notifications</a></p>`;
    return { subject: title, text, html };
  }
}
