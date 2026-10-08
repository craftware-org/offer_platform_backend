import { DomainEvents } from '../src/infrastructure/events/domain-events.js';
import { NestFactory } from '@nestjs/core';
import { eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { Role } from '../src/modules/access-control/access-control.catalog.js';
import { AccessControlService } from '../src/modules/access-control/access-control.service.js';
import { auditLogs } from '../src/modules/audit/audit.schema.js';
import { OfferLifecycleService } from '../src/modules/offers/offer-lifecycle.service.js';
import { offers } from '../src/modules/offers/offers.schema.js';
import { WorkerModule } from '../src/worker.module.js';
import { bearer, createTestApp, login, type LoggedIn, type TestContext } from './helpers/test-app.js';

const HUBBALLI_PIN = { latitude: 15.3602, longitude: 75.1301 };
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const jpeg = () =>
  sharp({ create: { width: 800, height: 600, channels: 3, background: '#3399cc' } })
    .jpeg()
    .toBuffer();

describe('Offers: create → review → live → expire (real Postgres/PostGIS + Valkey)', () => {
  let ctx: TestContext;
  let admin: LoggedIn;
  let superAdmin: LoggedIn;
  let owner: LoggedIn;
  let stranger: LoggedIn;
  let businessId: string;
  let businessSlug: string;
  let hubballiId: string;
  let fashionId: string;
  let foodId: string;

  const grant = (userId: string, role: Role) =>
    ctx.app.get(AccessControlService).grantRole(userId, role, null);
  const lifecycle = () => new OfferLifecycleService(ctx.db, ctx.app.get(DomainEvents));

  /** Registers a business and takes it through verification (verified by `verifier`). */
  const verifiedBusiness = async (who: LoggedIn, name: string, verifier: LoggedIn = admin) => {
    const biz = await ctx
      .http()
      .post('/api/v1/me/businesses')
      .set(bearer(who.accessToken))
      .send({
        name,
        categoryId: fashionId,
        phone: '0836 225 5123',
        whatsapp: '9845012345',
        location: { addressLine1: 'Shop 7, Koppikar Road', cityId: hubballiId, ...HUBBALLI_PIN },
      })
      .expect(201);
    const id: string = biz.body.data.id;
    await ctx
      .http()
      .post(`/api/v1/me/businesses/${id}/images`)
      .query({ kind: 'VERIFICATION_SHOP' })
      .set(bearer(who.accessToken))
      .attach('file', await jpeg(), 'shop.jpg')
      .expect(201);
    await ctx.http().post(`/api/v1/me/businesses/${id}/submit`).set(bearer(who.accessToken)).expect(200);
    await ctx
      .http()
      .patch(`/api/v1/admin/businesses/${id}/status`)
      .set(bearer(verifier.accessToken))
      .send({ action: 'VERIFY' })
      .expect(200);
    return { id, slug: biz.body.data.slug as string };
  };

  const createOffer = (who: LoggedIn, bizId: string, overrides: Record<string, unknown> = {}) =>
    ctx
      .http()
      .post(`/api/v1/me/businesses/${bizId}/offers`)
      .set(bearer(who.accessToken))
      .send({
        title: "40% OFF Selected Men's Shirts",
        categoryId: fashionId,
        pricing: { type: 'PRICE_DROP', originalPrice: 199900, offerPrice: 119900 },
        startsAt: hoursFromNow(-1),
        expiresAt: hoursFromNow(24 * 7),
        terms: 'Selected products only.',
        ...overrides,
      });

  const act = (who: LoggedIn, offerId: string, action: string) =>
    ctx.http().post(`/api/v1/me/offers/${offerId}/${action}`).set(bearer(who.accessToken));

  const moderate = (who: LoggedIn, offerId: string, action: string, reason?: string) =>
    ctx
      .http()
      .patch(`/api/v1/admin/offers/${offerId}/status`)
      .set(bearer(who.accessToken))
      .send(reason ? { action, reason } : { action });

  /** Create + submit + approve. */
  const liveOffer = async (overrides: Record<string, unknown> = {}) => {
    const created = await createOffer(owner, businessId, overrides).expect(201);
    const id: string = created.body.data.id;
    await act(owner, id, 'submit').expect(200);
    const approved = await moderate(admin, id, 'APPROVE').expect(200);
    return { id, slug: approved.body.data.slug as string, view: approved.body.data };
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    [admin, superAdmin, owner, stranger] = [
      await login(ctx),
      await login(ctx),
      await login(ctx),
      await login(ctx),
    ];
    await grant(admin.userId, Role.ADMIN);
    await grant(superAdmin.userId, Role.SUPER_ADMIN);

    const cities = await ctx.http().get('/api/v1/cities').expect(200);
    hubballiId = cities.body.data.find((c: { slug: string }) => c.slug === 'hubballi').id;
    const tree = await ctx.http().get('/api/v1/categories').expect(200);
    const find = (slug: string) =>
      tree.body.data
        .flatMap((p: { children: object[] }) => [p, ...p.children])
        .find((c: { slug: string }) => c.slug === slug).id;
    fashionId = find('fashion');
    foodId = find('restaurants');

    ({ id: businessId, slug: businessSlug } = await verifiedBusiness(owner, 'Raymond Menswear'));
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('all seven offer types', () => {
    it.each([
      [{ type: 'PRICE_DROP', originalPrice: 199900, offerPrice: 119900 }, '40% OFF', { discountPercent: 40 }],
      [{ type: 'PERCENTAGE_OFF', discountPercent: 50, isUpTo: true }, 'Up to 50% OFF', { isUpTo: true }],
      [
        { type: 'FLAT_AMOUNT_OFF', flatAmountOff: 20000, minPurchaseAmount: 100000 },
        '₹200 OFF on ₹1,000+',
        {},
      ],
      [{ type: 'BUY_X_GET_Y', buyQuantity: 2, getQuantity: 1, itemName: 'Shirts' }, 'Buy 2 Get 1 Free', {}],
      [
        { type: 'FREE_GIFT', itemName: 'Leather wallet', minPurchaseAmount: 300000 },
        'Free Leather wallet on ₹3,000+',
        {},
      ],
      [
        { type: 'COMBO', offerPrice: 149900, originalPrice: 199900, comboItems: ['Shirt', 'Trousers'] },
        'Combo at ₹1,499',
        { discountPercent: 25 },
      ],
      [{ type: 'OTHER' }, null, {}],
    ])('%j → headline %j', async (pricing, headline, expectedPricing) => {
      const res = await createOffer(owner, businessId, { title: `Test ${pricing.type}`, pricing }).expect(
        201,
      );
      expect(res.body.data).toMatchObject({
        type: pricing.type,
        status: 'DRAFT',
        headline,
        pricing: expectedPricing,
      });
    });

    it('computes the discount server-side and never accepts one for price drops', async () => {
      const res = await createOffer(owner, businessId, {
        pricing: { type: 'PRICE_DROP', originalPrice: 199900, offerPrice: 119900, discountPercent: 90 },
      }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an offer price that is not below the original, with the field named', async () => {
      const res = await createOffer(owner, businessId, {
        pricing: { type: 'PRICE_DROP', originalPrice: 100000, offerPrice: 120000 },
      }).expect(400);
      expect(res.body.error.fields).toHaveProperty(['pricing.offerPrice']);
    });

    it('rejects an end date before the start date', async () => {
      await createOffer(owner, businessId, {
        startsAt: hoursFromNow(48),
        expiresAt: hoursFromNow(24),
      }).expect(400);
    });

    it('the database itself refuses impossible prices (defence in depth)', async () => {
      // Drizzle wraps driver errors; the PostgreSQL error (with the violated constraint) is the cause.
      await expect(
        ctx.db.execute(sql`update offers set offer_price = original_price + 1 where type = 'PRICE_DROP'`),
      ).rejects.toMatchObject({ cause: { code: '23514', constraint: 'offers_offer_price_below_original' } });
    });

    it('records the first price in the price history', async () => {
      const created = await createOffer(owner, businessId).expect(201);
      const history = await ctx
        .http()
        .get(`/api/v1/me/offers/${created.body.data.id}/price-history`)
        .set(bearer(owner.accessToken))
        .expect(200);
      expect(history.body.data).toHaveLength(1);
      expect(history.body.data[0]).toMatchObject({
        source: 'CREATED',
        price: 119900,
        originalPrice: 199900,
        discountPercent: 40,
        changedBy: owner.userId,
      });
    });
  });

  describe('who can do what', () => {
    it('an unverified business can draft but not submit', async () => {
      const newcomer = await login(ctx);
      const biz = await ctx
        .http()
        .post('/api/v1/me/businesses')
        .set(bearer(newcomer.accessToken))
        .send({
          name: 'Not Yet Verified',
          categoryId: fashionId,
          phone: '9845099999',
          location: { addressLine1: 'Shop 1', cityId: hubballiId, ...HUBBALLI_PIN },
        })
        .expect(201);
      const draft = await createOffer(newcomer, biz.body.data.id).expect(201);
      const res = await act(newcomer, draft.body.data.id, 'submit').expect(403);
      expect(res.body.error.code).toBe('BUSINESS_NOT_VERIFIED');
    });

    it("others get 404 for a business's offers; customers can't reach admin endpoints", async () => {
      const draft = await createOffer(owner, businessId).expect(201);
      await ctx
        .http()
        .get(`/api/v1/me/offers/${draft.body.data.id}`)
        .set(bearer(stranger.accessToken))
        .expect(404);
      await ctx
        .http()
        .patch(`/api/v1/me/offers/${draft.body.data.id}`)
        .set(bearer(stranger.accessToken))
        .send({ title: 'Hijacked offer' })
        .expect(404);
      await createOffer(stranger, businessId).expect(404);
      await ctx.http().get('/api/v1/admin/offers').set(bearer(stranger.accessToken)).expect(403);
      await moderate(stranger, draft.body.data.id, 'APPROVE').expect(403);
    });

    it('an admin cannot approve offers of a business they own', async () => {
      const adminBiz = await verifiedBusiness(admin, 'Admin Family Store', superAdmin);
      const offer = await createOffer(admin, adminBiz.id).expect(201);
      await act(admin, offer.body.data.id, 'submit').expect(200);
      const res = await moderate(admin, offer.body.data.id, 'APPROVE').expect(403);
      expect(res.body.error.message).toContain('own');
      await moderate(superAdmin, offer.body.data.id, 'APPROVE').expect(200);
    });
  });

  describe('review workflow', () => {
    let offerId: string;
    let slug: string;

    it('submission runs automated checks (max duration)', async () => {
      const tooLong = await createOffer(owner, businessId, { expiresAt: hoursFromNow(24 * 100) }).expect(201);
      const res = await act(owner, tooLong.body.data.id, 'submit').expect(400);
      expect(res.body.error.fields).toEqual({ expiresAt: 'An offer can run for at most 90 days' });
    });

    it('a submitted offer is not public and cannot be edited until withdrawn', async () => {
      const created = await createOffer(owner, businessId).expect(201);
      offerId = created.body.data.id;
      slug = created.body.data.slug;
      const submitted = await act(owner, offerId, 'submit').expect(200);
      expect(submitted.body.data).toMatchObject({ status: 'PENDING_REVIEW', allowedActions: ['WITHDRAW'] });

      await ctx.http().get(`/api/v1/offers/${slug}`).expect(404);
      const edit = await ctx
        .http()
        .patch(`/api/v1/me/offers/${offerId}`)
        .set(bearer(owner.accessToken))
        .send({ title: 'Changed during review' })
        .expect(409);
      expect(edit.body.error.message).toContain('Withdraw');

      await act(owner, offerId, 'withdraw').expect(200);
      await act(owner, offerId, 'submit').expect(200);
    });

    it('appears in the admin queue; reject/request-changes need a reason', async () => {
      const queue = await ctx
        .http()
        .get('/api/v1/admin/offers')
        .query({ status: 'PENDING_REVIEW', businessId })
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(queue.body.data.map((o: { id: string }) => o.id)).toContain(offerId);
      await moderate(admin, offerId, 'REJECT').expect(400);
      await moderate(admin, offerId, 'REQUEST_CHANGES').expect(400);
    });

    it('request changes → business edits the price (history grows) → resubmits', async () => {
      const changes = await moderate(
        admin,
        offerId,
        'REQUEST_CHANGES',
        'Please add a photo of the shirts',
      ).expect(200);
      expect(changes.body.data).toMatchObject({
        status: 'DRAFT',
        statusReason: 'Please add a photo of the shirts',
      });

      await ctx
        .http()
        .patch(`/api/v1/me/offers/${offerId}`)
        .set(bearer(owner.accessToken))
        .send({ pricing: { type: 'PRICE_DROP', originalPrice: 199900, offerPrice: 99900 } })
        .expect(200);
      const history = await ctx
        .http()
        .get(`/api/v1/admin/offers/${offerId}/price-history`)
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(history.body.data.map((h: { source: string; price: number }) => [h.source, h.price])).toEqual([
        ['UPDATED_BY_BUSINESS', 99900],
        ['CREATED', 119900],
      ]);
      await act(owner, offerId, 'submit').expect(200);
    });

    it('approval makes a started offer ACTIVE and public, with business contact details', async () => {
      const approved = await moderate(admin, offerId, 'APPROVE').expect(200);
      expect(approved.body.data).toMatchObject({
        status: 'ACTIVE',
        availability: 'ACTIVE',
        approvedAt: expect.any(String),
      });

      const page = await ctx.http().get(`/api/v1/offers/${slug}`).expect(200);
      expect(page.body.data).toMatchObject({
        headline: '50% OFF',
        availability: 'ACTIVE',
        pricing: { originalPrice: 199900, offerPrice: 99900, discountPercent: 50, currency: 'INR' },
        business: { slug: businessSlug, isVerified: true, phone: '+918362255123', whatsapp: '+919845012345' },
      });
      expect(page.body.data).not.toHaveProperty('status');
      expect(page.body.data).not.toHaveProperty('statusReason');

      const list = await ctx
        .http()
        .get('/api/v1/offers')
        .query({ city: 'hubballi', category: 'shopping', business: businessSlug, pageSize: 50 })
        .expect(200);
      expect(list.body.data.map((o: { id: string }) => o.id)).toContain(offerId);
      const otherCategory = await ctx
        .http()
        .get('/api/v1/offers')
        .query({ category: 'food', pageSize: 50 })
        .expect(200);
      expect(otherCategory.body.data.map((o: { id: string }) => o.id)).not.toContain(offerId);
    });

    it('editing a live offer sends it back to review and hides it; the slug stays stable', async () => {
      const edited = await ctx
        .http()
        .patch(`/api/v1/me/offers/${offerId}`)
        .set(bearer(owner.accessToken))
        .send({ title: 'Half price on all formal shirts' })
        .expect(200);
      expect(edited.body.data).toMatchObject({ status: 'PENDING_REVIEW', slug });
      await ctx.http().get(`/api/v1/offers/${slug}`).expect(404);

      const audit = await ctx.db.select().from(auditLogs).where(eq(auditLogs.entityId, offerId));
      expect(audit.map((a) => a.action)).toContain('OFFER_EDITED_LIVE');
      await moderate(admin, offerId, 'APPROVE').expect(200);
      await ctx.http().get(`/api/v1/offers/${slug}`).expect(200);
    });
  });

  describe('schedule, pause, expiry', () => {
    it('an approved future offer is SCHEDULED, hidden, then activated by the lifecycle job', async () => {
      const { id, slug, view } = await liveOffer({ startsAt: hoursFromNow(2), expiresAt: hoursFromNow(48) });
      expect(view.status).toBe('SCHEDULED');
      await ctx.http().get(`/api/v1/offers/${slug}`).expect(404);

      await ctx.db
        .update(offers)
        .set({ startsAt: new Date(Date.now() - 60_000) })
        .where(eq(offers.id, id));
      const result = await lifecycle().runTransitions();
      expect(result.activated).toBeGreaterThanOrEqual(1);
      const page = await ctx.http().get(`/api/v1/offers/${slug}`).expect(200);
      expect(page.body.data.availability).toBe('ACTIVE');
    });

    it('pause shows PAUSED on the page and removes it from lists; resume restores it', async () => {
      const { id, slug } = await liveOffer({ title: 'Pause test offer' });
      await act(owner, id, 'pause').expect(200);
      expect((await ctx.http().get(`/api/v1/offers/${slug}`).expect(200)).body.data.availability).toBe(
        'PAUSED',
      );
      const list = await ctx
        .http()
        .get('/api/v1/offers')
        .query({ business: businessSlug, pageSize: 50 })
        .expect(200);
      expect(list.body.data.map((o: { id: string }) => o.id)).not.toContain(id);
      await act(owner, id, 'resume').expect(200);
      expect((await ctx.http().get(`/api/v1/offers/${slug}`).expect(200)).body.data.availability).toBe(
        'ACTIVE',
      );
    });

    it('an offer disappears at its end time even before the job runs; the job then marks it EXPIRED', async () => {
      const { id, slug } = await liveOffer({ title: 'Expiry test offer' });
      await ctx.db
        .update(offers)
        .set({ startsAt: new Date(Date.now() - 7_200_000), expiresAt: new Date(Date.now() - 1_000) })
        .where(eq(offers.id, id));

      const list = await ctx
        .http()
        .get('/api/v1/offers')
        .query({ business: businessSlug, pageSize: 50 })
        .expect(200);
      expect(list.body.data.map((o: { id: string }) => o.id)).not.toContain(id);
      expect((await ctx.http().get(`/api/v1/offers/${slug}`).expect(200)).body.data.availability).toBe(
        'EXPIRED',
      );

      await lifecycle().runTransitions();
      const [row] = await ctx.db.select().from(offers).where(eq(offers.id, id));
      expect(row?.status).toBe('EXPIRED');
      await ctx
        .http()
        .patch(`/api/v1/me/offers/${id}`)
        .set(bearer(owner.accessToken))
        .send({ title: 'Too late to edit' })
        .expect(409);
      await ctx.http().delete(`/api/v1/me/offers/${id}`).set(bearer(owner.accessToken)).expect(409);
    });

    it('ending early expires the offer now; it is kept, not deleted', async () => {
      const { id } = await liveOffer({ title: 'End early offer' });
      const ended = await act(owner, id, 'end').expect(200);
      expect(ended.body.data).toMatchObject({ status: 'EXPIRED', availability: 'EXPIRED' });
      expect(new Date(ended.body.data.expiresAt).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('the background worker (BullMQ on real Valkey) activates offers by itself', async () => {
      const { id, view } = await liveOffer({
        title: 'Worker test offer',
        startsAt: hoursFromNow(1),
        expiresAt: hoursFromNow(5),
      });
      expect(view.status).toBe('SCHEDULED');
      await ctx.db
        .update(offers)
        .set({ startsAt: new Date(Date.now() - 1_000) })
        .where(eq(offers.id, id));

      process.env.OFFER_LIFECYCLE_INTERVAL_MS = '1000';
      const worker = await NestFactory.createApplicationContext(WorkerModule, { logger: false });
      try {
        let status = 'SCHEDULED';
        for (let i = 0; i < 40 && status !== 'ACTIVE'; i++) {
          await new Promise((r) => setTimeout(r, 250));
          const [row] = await ctx.db.select({ status: offers.status }).from(offers).where(eq(offers.id, id));
          status = row?.status ?? status;
        }
        expect(status).toBe('ACTIVE');
      } finally {
        await worker.close();
        delete process.env.OFFER_LIFECYCLE_INTERVAL_MS;
      }
    }, 30_000);
  });

  describe('admin control', () => {
    it('suspend hides an offer (reason required); reactivate restores it by its dates', async () => {
      const { id, slug } = await liveOffer({ title: 'Suspend test offer' });
      await moderate(admin, id, 'SUSPEND').expect(400);
      await moderate(admin, id, 'SUSPEND', 'Customers report the discount is fake').expect(200);
      await ctx.http().get(`/api/v1/offers/${slug}`).expect(404);
      const owned = await ctx
        .http()
        .get(`/api/v1/me/offers/${id}`)
        .set(bearer(owner.accessToken))
        .expect(200);
      expect(owned.body.data).toMatchObject({
        status: 'SUSPENDED',
        statusReason: 'Customers report the discount is fake',
      });
      await moderate(admin, id, 'REACTIVATE').expect(200);
      await ctx.http().get(`/api/v1/offers/${slug}`).expect(200);
    });

    it('suspending a business hides all its live offers and blocks new approvals', async () => {
      const other = await login(ctx);
      const biz = await verifiedBusiness(other, 'Soon Suspended Stores');
      const live = await createOffer(other, biz.id, { categoryId: foodId }).expect(201);
      await act(other, live.body.data.id, 'submit').expect(200);
      await moderate(admin, live.body.data.id, 'APPROVE').expect(200);
      const pending = await createOffer(other, biz.id).expect(201);
      await act(other, pending.body.data.id, 'submit').expect(200);

      await ctx
        .http()
        .patch(`/api/v1/admin/businesses/${biz.id}/status`)
        .set(bearer(admin.accessToken))
        .send({ action: 'SUSPEND', reason: 'Investigation' })
        .expect(200);
      await ctx.http().get(`/api/v1/offers/${live.body.data.slug}`).expect(404);
      const res = await moderate(admin, pending.body.data.id, 'APPROVE').expect(409);
      expect(res.body.error.code).toBe('BUSINESS_NOT_VERIFIED');
    });

    it('invalid moderation transitions are refused', async () => {
      const draft = await createOffer(owner, businessId).expect(201);
      const res = await moderate(admin, draft.body.data.id, 'APPROVE').expect(409);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  describe('photos and housekeeping', () => {
    it('offer photos: private until live, public once live, limited by the admin setting', async () => {
      const draft = await createOffer(owner, businessId, { title: 'Photo test offer' }).expect(201);
      const id: string = draft.body.data.id;
      const up = await ctx
        .http()
        .post(`/api/v1/me/offers/${id}/images`)
        .set(bearer(owner.accessToken))
        .attach('file', await jpeg(), 'shirts.jpg')
        .expect(201);
      const imageId: string = up.body.data.id;
      await ctx.http().get(`/api/v1/media/offer-images/${imageId}/thumb`).expect(404);

      await ctx
        .http()
        .put('/api/v1/admin/settings/offers.limits')
        .set(bearer(superAdmin.accessToken))
        .send({ value: { maxDurationDays: 90, maxImages: 1 } })
        .expect(200);
      await ctx
        .http()
        .post(`/api/v1/me/offers/${id}/images`)
        .set(bearer(owner.accessToken))
        .attach('file', await jpeg(), 'more.jpg')
        .expect(409);
      await ctx
        .http()
        .put('/api/v1/admin/settings/offers.limits')
        .set(bearer(superAdmin.accessToken))
        .send({ value: { maxDurationDays: 90, maxImages: 5 } })
        .expect(200);

      await act(owner, id, 'submit').expect(200);
      const approved = await moderate(admin, id, 'APPROVE').expect(200);
      const publicUrl: string = (
        await ctx.http().get(`/api/v1/offers/${approved.body.data.slug}`).expect(200)
      ).body.data.images[0].urls.thumb;
      expect(publicUrl).toBe(`/api/v1/media/offer-images/${imageId}/thumb`);
      const img = await ctx.http().get(publicUrl).expect(200);
      expect(img.headers['content-type']).toBe('image/webp');
      // The website (another origin) embeds public photos with <img>.
      expect(img.headers['cross-origin-resource-policy']).toBe('cross-origin');

      // Changing the photos of a live offer sends it back to review.
      await ctx
        .http()
        .post(`/api/v1/me/offers/${id}/images`)
        .set(bearer(owner.accessToken))
        .attach('file', await jpeg(), 'new.jpg')
        .expect(201);
      const after = await ctx
        .http()
        .get(`/api/v1/me/offers/${id}`)
        .set(bearer(owner.accessToken))
        .expect(200);
      expect(after.body.data.status).toBe('PENDING_REVIEW');
    });

    it('only never-submitted drafts can be deleted', async () => {
      const draft = await createOffer(owner, businessId, { title: 'Throwaway draft' }).expect(201);
      await ctx
        .http()
        .delete(`/api/v1/me/offers/${draft.body.data.id}`)
        .set(bearer(owner.accessToken))
        .expect(204);
      await ctx
        .http()
        .get(`/api/v1/me/offers/${draft.body.data.id}`)
        .set(bearer(owner.accessToken))
        .expect(404);

      const submitted = await createOffer(owner, businessId, { title: 'Submitted once' }).expect(201);
      await act(owner, submitted.body.data.id, 'submit').expect(200);
      await act(owner, submitted.body.data.id, 'withdraw').expect(200);
      await ctx
        .http()
        .delete(`/api/v1/me/offers/${submitted.body.data.id}`)
        .set(bearer(owner.accessToken))
        .expect(409);
    });

    it('the dashboard summary counts offers by status', async () => {
      const res = await ctx
        .http()
        .get(`/api/v1/me/businesses/${businessId}/offers/summary`)
        .set(bearer(owner.accessToken))
        .expect(200);
      expect(res.body.data.ACTIVE).toBeGreaterThanOrEqual(1);
      expect(res.body.data.DRAFT).toBeGreaterThanOrEqual(1);
      expect(Object.keys(res.body.data).sort()).toEqual([
        'ACTIVE',
        'DRAFT',
        'EXPIRED',
        'PAUSED',
        'PENDING_REVIEW',
        'REJECTED',
        'SCHEDULED',
        'SUSPENDED',
      ]);
    });
  });
});
