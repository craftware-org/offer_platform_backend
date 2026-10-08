import { and, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { DomainEvents } from '../src/infrastructure/events/domain-events.js';
import { Role } from '../src/modules/access-control/access-control.catalog.js';
import { AccessControlService } from '../src/modules/access-control/access-control.service.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { notifications } from '../src/modules/notifications/notifications.schema.js';
import { OfferLifecycleService } from '../src/modules/offers/offer-lifecycle.service.js';
import { offers } from '../src/modules/offers/offers.schema.js';
import { approvedOffer, loadRefs, verifiedBusiness } from './helpers/fixtures.js';
import { bearer, createTestApp, login, type LoggedIn, type TestContext } from './helpers/test-app.js';

const ist = (iso: string) => new Date(`${iso}+05:30`);

describe('Phase 6 notifications — real Postgres + Valkey', () => {
  let ctx: TestContext;
  let notificationsService: NotificationsService;
  let admin: LoggedIn;
  let owner: LoggedIn & { email: string };
  let fan: LoggedIn & { email: string };
  let categoryId: string;
  let cityId: string;

  /** Email code login, so the account has a VERIFIED email (notification emails need one). */
  const emailUser = async (): Promise<LoggedIn & { email: string }> => {
    const email = `n.${randomBytes(4).toString('hex')}@example.com`;
    await ctx.http().post('/api/v1/auth/otp/request').send({ email }).expect(202);
    const res = await ctx
      .http()
      .post('/api/v1/auth/otp/verify')
      .send({ email, code: ctx.email.lastCodeFor(email) })
      .expect(200);
    const d = res.body.data;
    return { userId: d.user.id, accessToken: d.accessToken, refreshToken: d.refreshToken, phone: '', email };
  };
  const as = (u: LoggedIn) => bearer(u.accessToken);
  const inbox = async (u: LoggedIn) => (await ctx.http().get('/api/v1/me/notifications').set(as(u)).expect(200)).body;
  const rowsFor = (userId: string) => ctx.db.select().from(notifications).where(eq(notifications.userId, userId));

  beforeAll(async () => {
    ctx = await createTestApp();
    notificationsService = ctx.app.get(NotificationsService);
    admin = await login(ctx);
    await ctx.app.get(AccessControlService).grantRole(admin.userId, Role.ADMIN, null);
    owner = await emailUser();
    fan = await emailUser();
    const refs = await loadRefs(ctx);
    categoryId = refs.categoryId('footwear');
    cityId = refs.cityId('hubballi');
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('a verified business tells its owner by inbox and email (business emails are on by default)', async () => {
    const biz = await verifiedBusiness(ctx, owner, admin, { name: 'Notify Shoes', categoryId, cityId, latitude: 15.36, longitude: 75.13 });
    const box = await inbox(owner);
    expect(box.meta.unread).toBeGreaterThanOrEqual(1);
    const verified = box.data.find((n: { type: string }) => n.type === 'BUSINESS_VERIFIED');
    expect(verified).toMatchObject({ title: '“Notify Shoes” is verified', link: `/business/${biz.id}`, read: false });

    const [row] = (await rowsFor(owner.userId)).filter((r) => r.type === 'BUSINESS_VERIFIED');
    expect(row!.emailStatus).toBe('PENDING');

    const before = ctx.email.sent.length;
    const result = await notificationsService.sendPendingEmails();
    expect(result.sent).toBeGreaterThanOrEqual(1);
    const mail = ctx.email.sent.slice(before).find((m) => m.to === owner.email && m.subject === '“Notify Shoes” is verified');
    expect(mail?.text).toContain('Customers can now find your shop');
    expect(mail?.text).toMatch(/Stop emails like this: https?:\/\/.+\/unsubscribe\?token=/);
    const [sentRow] = (await rowsFor(owner.userId)).filter((r) => r.type === 'BUSINESS_VERIFIED');
    expect(sentRow!.emailStatus).toBe('SENT');
    // A phone-only admin who verified it gets nothing; phone-only owners would get the inbox only.
  });

  it('offer decisions reach the owner; followers hear about a new live offer once', async () => {
    const biz = await verifiedBusiness(ctx, owner, admin, { name: 'Follow Me Shop', categoryId, cityId, latitude: 15.36, longitude: 75.13 });
    await ctx.http().post('/api/v1/me/follows').set(as(fan)).send({ businessId: biz.id }).expect(204);

    const offer = await approvedOffer(ctx, owner, admin, biz.id, {
      title: 'Follower sale',
      categoryId,
      pricing: { type: 'PERCENTAGE_OFF', discountPercent: 15 },
    });
    const ownerBox = await inbox(owner);
    expect(ownerBox.data.some((n: { type: string; title: string }) => n.type === 'OFFER_APPROVED' && n.title.includes('Follower sale'))).toBe(true);

    const fanBox = await inbox(fan);
    const news = fanBox.data.filter((n: { type: string }) => n.type === 'FOLLOWED_SHOP_NEW_OFFER');
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({ title: 'New offer from Follow Me Shop', body: 'Follower sale', link: `/offers/${offer.slug}` });
    // Customers are inbox-only by default.
    const [fanRow] = (await rowsFor(fan.userId)).filter((r) => r.type === 'FOLLOWED_SHOP_NEW_OFFER');
    expect(fanRow!.emailStatus).toBe('NONE');

    // Suspend + reactivate goes live again, but followers are not told twice.
    await ctx.http().patch(`/api/v1/admin/offers/${offer.id}/status`).set(as(admin)).send({ action: 'SUSPEND', reason: 'Checking the photos' }).expect(200);
    await ctx.http().patch(`/api/v1/admin/offers/${offer.id}/status`).set(as(admin)).send({ action: 'REACTIVATE' }).expect(200);
    const again = (await inbox(fan)).data.filter((n: { type: string }) => n.type === 'FOLLOWED_SHOP_NEW_OFFER');
    expect(again).toHaveLength(1);
    expect((await inbox(owner)).data.some((n: { type: string; body: string }) => n.type === 'OFFER_SUSPENDED' && n.body.includes('Checking the photos'))).toBe(true);
  });

  it('scheduled offers going live (worker) notify followers too', async () => {
    const biz = await verifiedBusiness(ctx, owner, admin, { name: 'Later Shop', categoryId, cityId, latitude: 15.36, longitude: 75.13 });
    await ctx.http().post('/api/v1/me/follows').set(as(fan)).send({ businessId: biz.id }).expect(204);
    const created = await ctx
      .http()
      .post(`/api/v1/me/businesses/${biz.id}/offers`)
      .set(as(owner))
      .send({
        title: 'Starts later',
        categoryId,
        pricing: { type: 'PERCENTAGE_OFF', discountPercent: 10 },
        startsAt: new Date(Date.now() + 3_600_000).toISOString(),
        expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
      .expect(201);
    await ctx.http().post(`/api/v1/me/offers/${created.body.data.id}/submit`).set(as(owner)).expect(200);
    const approved = await ctx.http().patch(`/api/v1/admin/offers/${created.body.data.id}/status`).set(as(admin)).send({ action: 'APPROVE' }).expect(200);
    expect(approved.body.data.status).toBe('SCHEDULED');
    expect((await inbox(fan)).data.some((n: { body: string }) => n.body === 'Starts later')).toBe(false);

    await ctx.db.update(offers).set({ startsAt: new Date(Date.now() - 60_000) }).where(eq(offers.id, created.body.data.id));
    await new OfferLifecycleService(ctx.db, ctx.app.get(DomainEvents)).runTransitions();
    expect((await inbox(fan)).data.some((n: { body: string }) => n.body === 'Starts later')).toBe(true);
  });

  it('ending within a day: owner and savers are told once', async () => {
    const biz = await verifiedBusiness(ctx, owner, admin, { name: 'Ending Shop', categoryId, cityId, latitude: 15.36, longitude: 75.13 });
    const offer = await approvedOffer(ctx, owner, admin, biz.id, { title: 'Last day sale', categoryId, pricing: { type: 'PERCENTAGE_OFF', discountPercent: 30 } });
    await ctx.http().post('/api/v1/me/saved-offers').set(as(fan)).send({ offerId: offer.id }).expect(204);
    await ctx.db.update(offers).set({ expiresAt: new Date(Date.now() + 5 * 3_600_000) }).where(eq(offers.id, offer.id));

    await notificationsService.notifyEndingSoon();
    await notificationsService.notifyEndingSoon(); // second run: nothing new
    const ownerEnding = (await rowsFor(owner.userId)).filter((r) => r.type === 'OFFER_ENDING_SOON' && r.title.includes('Last day sale'));
    const fanEnding = (await rowsFor(fan.userId)).filter((r) => r.type === 'SAVED_OFFER_ENDING' && r.title.includes('Last day sale'));
    expect(ownerEnding).toHaveLength(1);
    expect(fanEnding).toHaveLength(1);
  });

  it('customer emails are opt-in and wait out quiet hours (22:00–08:00 India time)', async () => {
    await ctx
      .http()
      .put('/api/v1/me/notification-preferences')
      .set(as(fan))
      .send({ type: 'FOLLOWED_SHOP_NEW_OFFER', inApp: true, email: true })
      .expect(204);
    const night = ist('2026-10-08T23:30:00');
    await notificationsService.notify(
      [fan.userId],
      { type: 'FOLLOWED_SHOP_NEW_OFFER', title: 'Night offer', body: 'x', link: null },
      night,
    );
    const [row] = await ctx.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, fan.userId), eq(notifications.title, 'Night offer')));
    expect(row).toMatchObject({ emailStatus: 'PENDING' });
    expect(row!.emailNotBefore).toEqual(ist('2026-10-09T08:00:00'));

    // Not sent before 08:00, sent after.
    await notificationsService.sendPendingEmails(ist('2026-10-09T07:00:00'));
    expect((await ctx.db.select().from(notifications).where(eq(notifications.id, row!.id)))[0]!.emailStatus).toBe('PENDING');
    await notificationsService.sendPendingEmails(ist('2026-10-09T08:01:00'));
    expect((await ctx.db.select().from(notifications).where(eq(notifications.id, row!.id)))[0]!.emailStatus).toBe('SENT');
  });

  it('preferences: inbox off hides it; the one-click unsubscribe link turns email off', async () => {
    const prefs = (await ctx.http().get('/api/v1/me/notification-preferences').set(as(owner)).expect(200)).body.data;
    expect(prefs.find((p: { type: string }) => p.type === 'OFFER_APPROVED')).toMatchObject({ inApp: true, email: true, audience: 'BUSINESS' });
    expect(prefs.some((p: { type: string }) => p.type === 'ADMIN_DAILY_SUMMARY')).toBe(false); // not an admin

    const token = notificationsService.unsubscribeToken(owner.userId, 'OFFER_APPROVED');
    const res = await ctx.http().post('/api/v1/notifications/unsubscribe').send({ token }).expect(200);
    expect(res.body.data).toMatchObject({ type: 'OFFER_APPROVED' });
    const after = (await ctx.http().get('/api/v1/me/notification-preferences').set(as(owner)).expect(200)).body.data;
    expect(after.find((p: { type: string }) => p.type === 'OFFER_APPROVED')).toMatchObject({ inApp: true, email: false });

    await ctx.http().post('/api/v1/notifications/unsubscribe').send({ token: `${token.split('.')[0]}.forged-signature-xx` }).expect(400);

    await ctx.http().put('/api/v1/me/notification-preferences').set(as(owner)).send({ type: 'OFFER_REJECTED', inApp: false, email: false }).expect(204);
    await notificationsService.notify([owner.userId], { type: 'OFFER_REJECTED', title: 'Hidden one', body: 'x', link: null });
    expect((await inbox(owner)).data.some((n: { title: string }) => n.title === 'Hidden one')).toBe(false);
  });

  it('inbox: unread count, mark read, and only your own', async () => {
    const before = (await ctx.http().get('/api/v1/me/notifications/unread-count').set(as(fan)).expect(200)).body.data.unread;
    expect(before).toBeGreaterThan(0);
    const first = (await inbox(fan)).data[0];
    await ctx.http().post('/api/v1/me/notifications/read').set(as(owner)).send({ ids: [first.id] }).expect(204);
    expect((await inbox(fan)).data[0].read).toBe(false); // owner can't mark the fan's
    await ctx.http().post('/api/v1/me/notifications/read').set(as(fan)).send({ ids: [first.id] }).expect(204);
    expect((await inbox(fan)).data[0].read).toBe(true);
    await ctx.http().post('/api/v1/me/notifications/read').set(as(fan)).send({ all: true }).expect(204);
    expect((await ctx.http().get('/api/v1/me/notifications/unread-count').set(as(fan)).expect(200)).body.data.unread).toBe(0);
    await ctx.http().get('/api/v1/me/notifications').expect(401);
  });

  it('admins get one daily summary when work is waiting', async () => {
    // A business waiting for review.
    const pending = await ctx
      .http()
      .post('/api/v1/me/businesses')
      .set(as(fan))
      .send({ name: 'Waiting Shop', categoryId, phone: '0836 225 5000', location: { addressLine1: 'Shop 9, Main Road', cityId, latitude: 15.36, longitude: 75.13 } })
      .expect(201);
    // Fast-forward the checklist: mark it submitted directly (verification photos are covered elsewhere).
    await ctx.db.execute(sql`UPDATE businesses SET status = 'UNDER_REVIEW', submitted_at = now() WHERE id = ${pending.body.data.id}`);
    const created = await notificationsService.sendAdminDailySummary(ist('2026-10-09T09:00:00'));
    expect(created).toBeGreaterThanOrEqual(1);
    expect(await notificationsService.sendAdminDailySummary(ist('2026-10-09T09:05:00'))).toBe(0); // once per day
    const box = await inbox(admin);
    expect(box.data.find((n: { type: string }) => n.type === 'ADMIN_DAILY_SUMMARY')?.title).toMatch(/^Waiting for review: 1 business/);
  });
});
