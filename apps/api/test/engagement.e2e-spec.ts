import { and, eq } from 'drizzle-orm';
import { Role } from '../src/modules/access-control/access-control.catalog.js';
import { AccessControlService } from '../src/modules/access-control/access-control.service.js';
import { auditLogs } from '../src/modules/audit/audit.schema.js';
import { analyticsEvents } from '../src/modules/engagement/engagement.schema.js';
import { offers } from '../src/modules/offers/offers.schema.js';
import { approvedOffer, loadRefs, verifiedBusiness } from './helpers/fixtures.js';
import { bearer, createTestApp, login, type LoggedIn, type TestContext } from './helpers/test-app.js';

const offerBody = (title: string) => ({
  title,
  pricing: { type: 'PERCENTAGE_OFF', discountPercent: 20 },
});

describe('Phase 5 engagement and reports — real Postgres + Valkey', () => {
  let ctx: TestContext;
  let owner: LoggedIn;
  let admin: LoggedIn;
  let customer: LoggedIn;
  let other: LoggedIn;
  let business: { id: string; slug: string };
  let offer: { id: string; slug: string };
  let categoryId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    [owner, admin, customer, other] = [await login(ctx), await login(ctx), await login(ctx), await login(ctx)];
    await ctx.app.get(AccessControlService).grantRole(admin.userId, Role.ADMIN, null);
    const refs = await loadRefs(ctx);
    categoryId = refs.categoryId('footwear');
    business = await verifiedBusiness(ctx, owner, admin, {
      name: 'Engage Shoes',
      categoryId,
      cityId: refs.cityId('hubballi'),
      latitude: 15.36,
      longitude: 75.13,
    });
    offer = await approvedOffer(ctx, owner, admin, business.id, { ...offerBody('Engage sale'), categoryId });
  });
  afterAll(async () => {
    await ctx.close();
  });

  const as = (u: LoggedIn) => bearer(u.accessToken);

  describe('saved offers', () => {
    it('saves once, lists, unsaves; needs login', async () => {
      await ctx.http().post('/api/v1/me/saved-offers').send({ offerId: offer.id }).expect(401);
      await ctx.http().post('/api/v1/me/saved-offers').set(as(customer)).send({ offerId: offer.id }).expect(204);
      await ctx.http().post('/api/v1/me/saved-offers').set(as(customer)).send({ offerId: offer.id }).expect(204);

      const ids = await ctx.http().get('/api/v1/me/saved-offers/ids').set(as(customer)).expect(200);
      expect(ids.body.data).toEqual([offer.id]);
      const list = await ctx.http().get('/api/v1/me/saved-offers').set(as(customer)).expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({ id: offer.id, availability: 'ACTIVE' });
      expect(list.body.data[0].savedAt).toBeDefined();

      // Only one OFFER_SAVED event for two saves.
      const events = await ctx.db
        .select()
        .from(analyticsEvents)
        .where(and(eq(analyticsEvents.offerId, offer.id), eq(analyticsEvents.type, 'OFFER_SAVED')));
      expect(events).toHaveLength(1);

      await ctx.http().delete(`/api/v1/me/saved-offers/${offer.id}`).set(as(customer)).expect(204);
      const after = await ctx.http().get('/api/v1/me/saved-offers/ids').set(as(customer)).expect(200);
      expect(after.body.data).toEqual([]);
    });

    it('moves ended offers to the "ended" list and refuses to save them', async () => {
      const ending = await approvedOffer(ctx, owner, admin, business.id, { ...offerBody('Ending soon sale'), categoryId });
      await ctx.http().post('/api/v1/me/saved-offers').set(as(customer)).send({ offerId: ending.id }).expect(204);
      await ctx.db.update(offers).set({ status: 'EXPIRED' }).where(eq(offers.id, ending.id));

      const active = await ctx.http().get('/api/v1/me/saved-offers?status=active').set(as(customer)).expect(200);
      expect(active.body.data.map((o: { id: string }) => o.id)).not.toContain(ending.id);
      const ended = await ctx.http().get('/api/v1/me/saved-offers?status=ended').set(as(customer)).expect(200);
      expect(ended.body.data.map((o: { id: string }) => o.id)).toContain(ending.id);

      const refused = await ctx.http().post('/api/v1/me/saved-offers').set(as(other)).send({ offerId: ending.id }).expect(409);
      expect(refused.body.error.message).toContain('ended');
    });

    it('cannot save offers that are not public', async () => {
      const draft = await ctx
        .http()
        .post(`/api/v1/me/businesses/${business.id}/offers`)
        .set(as(owner))
        .send({ ...offerBody('Draft only'), categoryId, startsAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() })
        .expect(201);
      await ctx.http().post('/api/v1/me/saved-offers').set(as(customer)).send({ offerId: draft.body.data.id }).expect(404);
    });
  });

  describe('following', () => {
    it('follows, lists, feeds live offers from followed shops, unfollows', async () => {
      await ctx.http().post('/api/v1/me/follows').set(as(customer)).send({ businessId: business.id }).expect(204);
      await ctx.http().post('/api/v1/me/follows').set(as(customer)).send({ businessId: business.id }).expect(204);
      const list = await ctx.http().get('/api/v1/me/follows').set(as(customer)).expect(200);
      expect(list.body.data.map((b: { id: string }) => b.id)).toEqual([business.id]);
      const feed = await ctx.http().get('/api/v1/me/feed/following').set(as(customer)).expect(200);
      expect(feed.body.data.map((o: { id: string }) => o.id)).toContain(offer.id);

      await ctx.http().delete(`/api/v1/me/follows/${business.id}`).set(as(customer)).expect(204);
      const empty = await ctx.http().get('/api/v1/me/feed/following').set(as(customer)).expect(200);
      expect(empty.body.data).toEqual([]);
      await ctx.http().post('/api/v1/me/follows').set(as(customer)).send({ businessId: '01a0f85a-b715-7122-8c81-000000000000' }).expect(404);
    });
  });

  describe('share and contact taps (logged-in users only)', () => {
    it('counts each person once per 30 minutes and shows totals to the owner only', async () => {
      await ctx.http().post('/api/v1/events').send({ type: 'CALL_CLICKED', offerId: offer.id }).expect(401);
      for (const u of [customer, customer, other]) {
        await ctx.http().post('/api/v1/events').set(as(u)).send({ type: 'CALL_CLICKED', offerId: offer.id }).expect(204);
      }
      await ctx.http().post('/api/v1/events').set(as(customer)).send({ type: 'OFFER_SHARED', offerId: offer.id }).expect(204);
      await ctx.http().post('/api/v1/events').set(as(customer)).send({ type: 'DIRECTIONS_CLICKED', businessId: business.id }).expect(204);
      await ctx.http().post('/api/v1/events').set(as(customer)).send({ type: 'OFFER_SHARED', businessId: business.id }).expect(400);
      await ctx.http().post('/api/v1/events').set(as(customer)).send({ type: 'OFFER_VIEWED', offerId: offer.id }).expect(400);

      await ctx.http().post('/api/v1/me/follows').set(as(other)).send({ businessId: business.id }).expect(204);
      await ctx.http().post('/api/v1/me/saved-offers').set(as(other)).send({ offerId: offer.id }).expect(204);

      const stats = await ctx.http().get(`/api/v1/me/businesses/${business.id}/engagement`).set(as(owner)).expect(200);
      expect(stats.body.data.followers).toBe(1);
      // Totals include the save of "Ending soon sale" from the earlier test (saves of ended offers still count).
      expect(stats.body.data.totals).toMatchObject({ saves: 2, calls: 2, shares: 1, directions: 1 });
      const row = stats.body.data.offers.find((o: { offerId: string }) => o.offerId === offer.id);
      expect(row).toMatchObject({ title: 'Engage sale', saves: 1, calls: 2, shares: 1 });

      await ctx.http().get(`/api/v1/me/businesses/${business.id}/engagement`).set(as(customer)).expect(404);
    });
  });

  describe('reports', () => {
    it('logged-in users report once per offer; admins see the queue', async () => {
      await ctx.http().post('/api/v1/reports').send({ offerId: offer.id, reason: 'WRONG_DISCOUNT' }).expect(401);
      const created = await ctx
        .http()
        .post('/api/v1/reports')
        .set(as(customer))
        .send({ offerId: offer.id, reason: 'WRONG_DISCOUNT', note: 'Shop says 10%, not 20%' })
        .expect(201);
      expect(created.body.data.status).toBe('OPEN');
      await ctx.http().post('/api/v1/reports').set(as(customer)).send({ offerId: offer.id, reason: 'OTHER' }).expect(409);
      await ctx.http().post('/api/v1/reports').set(as(customer)).send({ offerId: offer.id, reason: 'NOT_A_REASON' }).expect(400);

      await ctx.http().get('/api/v1/admin/reports').set(as(customer)).expect(403);
      const queue = await ctx.http().get('/api/v1/admin/reports?status=OPEN').set(as(admin)).expect(200);
      const item = queue.body.data.find((r: { id: string }) => r.id === created.body.data.id);
      expect(item).toMatchObject({
        reason: 'WRONG_DISCOUNT',
        note: 'Shop says 10%, not 20%',
        offer: { id: offer.id, title: 'Engage sale' },
        business: { id: business.id, name: 'Engage Shoes' },
        openReportsOnOffer: 1,
      });
    });

    it('dismiss closes one report; a warning reaches the business dashboard', async () => {
      const r1 = (await ctx.http().get('/api/v1/admin/reports?status=OPEN').set(as(admin)).expect(200)).body.data[0];
      const dismissed = await ctx.http().patch(`/api/v1/admin/reports/${r1.id}`).set(as(admin)).send({ action: 'DISMISS' }).expect(200);
      expect(dismissed.body.data).toMatchObject({ status: 'DISMISSED' });
      await ctx.http().patch(`/api/v1/admin/reports/${r1.id}`).set(as(admin)).send({ action: 'DISMISS' }).expect(409);

      const r2 = await ctx.http().post('/api/v1/reports').set(as(other)).send({ offerId: offer.id, reason: 'MISLEADING_INFORMATION' }).expect(201);
      await ctx.http().patch(`/api/v1/admin/reports/${r2.body.data.id}`).set(as(admin)).send({ action: 'WARN_BUSINESS' }).expect(400);
      await ctx
        .http()
        .patch(`/api/v1/admin/reports/${r2.body.data.id}`)
        .set(as(admin))
        .send({ action: 'WARN_BUSINESS', note: 'Please show the real discount in the photos.' })
        .expect(200);
      const warnings = await ctx.http().get(`/api/v1/me/businesses/${business.id}/warnings`).set(as(owner)).expect(200);
      expect(warnings.body.data[0]).toMatchObject({
        message: 'Please show the real discount in the photos.',
        reason: 'MISLEADING_INFORMATION',
        offer: { id: offer.id, title: 'Engage sale' },
      });
      await ctx.http().get(`/api/v1/me/businesses/${business.id}/warnings`).set(as(customer)).expect(404);

      const audit = await ctx.db.select().from(auditLogs).where(eq(auditLogs.action, 'BUSINESS_WARNED'));
      expect(audit.some((a) => a.entityId === business.id)).toBe(true);
    });

    it('suspending the offer closes every open report on it and hides the offer', async () => {
      const target = await approvedOffer(ctx, owner, admin, business.id, { ...offerBody('Suspicious sale'), categoryId });
      const a = await ctx.http().post('/api/v1/reports').set(as(customer)).send({ offerId: target.id, reason: 'SUSPICIOUS_ACTIVITY' }).expect(201);
      await ctx.http().post('/api/v1/reports').set(as(other)).send({ offerId: target.id, reason: 'OFFER_UNAVAILABLE' }).expect(201);

      const done = await ctx
        .http()
        .patch(`/api/v1/admin/reports/${a.body.data.id}`)
        .set(as(admin))
        .send({ action: 'SUSPEND_OFFER', note: 'Several customers reported this as fake.' })
        .expect(200);
      expect(done.body.data.status).toBe('RESOLVED');
      expect(done.body.data.actions[0]).toMatchObject({ action: 'SUSPEND_OFFER', note: 'Several customers reported this as fake.' });

      const open = await ctx.http().get('/api/v1/admin/reports?status=OPEN').set(as(admin)).expect(200);
      expect(open.body.data.filter((r: { offer: { id: string } }) => r.offer.id === target.id)).toHaveLength(0);
      const owned = await ctx.http().get(`/api/v1/me/offers/${target.id}`).set(as(owner)).expect(200);
      expect(owned.body.data).toMatchObject({ status: 'SUSPENDED', statusReason: 'Several customers reported this as fake.' });
      await ctx.http().get(`/api/v1/offers/${target.slug}`).expect(404);
    });

    it('suspending the business needs businesses:manage and closes its open reports', async () => {
      const second = await verifiedBusiness(ctx, owner, admin, {
        name: 'Closed Shop',
        categoryId,
        cityId: (await loadRefs(ctx)).cityId('dharwad'),
        latitude: 15.45,
        longitude: 75.0,
      });
      const o = await approvedOffer(ctx, owner, admin, second.id, { ...offerBody('Closed shop sale'), categoryId });
      const r = await ctx.http().post('/api/v1/reports').set(as(customer)).send({ offerId: o.id, reason: 'BUSINESS_CLOSED' }).expect(201);

      await ctx
        .http()
        .patch(`/api/v1/admin/reports/${r.body.data.id}`)
        .set(as(admin))
        .send({ action: 'SUSPEND_BUSINESS', note: 'The shop has closed down.' })
        .expect(200);
      await ctx.http().get(`/api/v1/businesses/${second.slug}`).expect(404);
      const view = await ctx.http().get(`/api/v1/admin/reports/${r.body.data.id}`).set(as(admin)).expect(200);
      expect(view.body.data.status).toBe('RESOLVED');
    });

    it('activity feed names reports by their offer', async () => {
      const feed = await ctx.http().get('/api/v1/admin/activity?entityType=report').set(as(admin));
      // ADMIN has audit:read
      expect(feed.status).toBe(200);
      expect(feed.body.data.some((e: { entityLabel: string | null }) => e.entityLabel === 'Engage sale')).toBe(true);
    });
  });
});
