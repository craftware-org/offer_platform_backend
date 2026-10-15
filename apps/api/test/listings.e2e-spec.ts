import { Role } from '../src/modules/access-control/access-control.catalog.js';
import { approvedOffer, hoursFromNow, loadRefs, type Refs } from './helpers/fixtures.js';
import {
  bearer,
  createTestApp,
  login,
  makeAdmin,
  type LoggedIn,
  type TestContext,
} from './helpers/test-app.js';

const SOURCE = 'https://www.example-burgers.in/offers';

describe('Platform listings: shops listed by an admin from a brand page (real Postgres/PostGIS + Valkey)', () => {
  let ctx: TestContext;
  let lister: LoggedIn;
  let reviewer: LoggedIn;
  let customer: LoggedIn;
  let refs: Refs;

  beforeAll(async () => {
    ctx = await createTestApp();
    lister = await makeAdmin(ctx, await login(ctx), Role.ADMIN);
    reviewer = await makeAdmin(ctx, await login(ctx), Role.ADMIN);
    customer = await login(ctx);
    refs = await loadRefs(ctx);
  });

  afterAll(async () => {
    await ctx.close();
  });

  const listingBody = (overrides: Record<string, unknown> = {}) => ({
    name: 'Burger Corner Vidya Nagar',
    categoryId: refs.categoryId('fast-food'),
    phone: '0836 225 5000',
    sourceUrl: SOURCE,
    location: {
      addressLine1: 'Ground floor, Unkal Cross',
      cityId: refs.cityId('hubballi'),
      latitude: 15.3602,
      longitude: 75.1301,
    },
    ...overrides,
  });

  const createListing = (who: LoggedIn, body = listingBody()) =>
    ctx.http().post('/api/v1/admin/businesses/listings').set(bearer(who.accessToken)).send(body);

  it('only admins with businesses:manage can list a shop, and a source page is required', async () => {
    await ctx.http().post('/api/v1/admin/businesses/listings').send(listingBody()).expect(401);
    await createListing(customer).expect(403);
    const missing = await createListing(lister, { ...listingBody(), sourceUrl: undefined } as never).expect(
      400,
    );
    expect(missing.body.error.fields).toHaveProperty('sourceUrl');
    await createListing(lister, listingBody({ sourceUrl: 'javascript:alert(1)' })).expect(400);
  });

  it('is public at once, shown as listed and never as verified, and audited', async () => {
    const created = await createListing(lister).expect(201);
    const shop = created.body.data;
    expect(shop).toMatchObject({
      status: 'VERIFIED',
      listedByPlatform: true,
      sourceUrl: SOURCE,
      isVerified: false,
      verifiedAt: null,
      ownerUserId: lister.userId,
    });

    const pub = (await ctx.http().get(`/api/v1/businesses/${shop.slug}`).expect(200)).body.data;
    expect(pub).toMatchObject({ listedByPlatform: true, sourceUrl: SOURCE, isVerified: false });

    const listed = await ctx
      .http()
      .get('/api/v1/admin/businesses')
      .query({ listed: 'true' })
      .set(bearer(reviewer.accessToken))
      .expect(200);
    expect(listed.body.data.map((b: { id: string }) => b.id)).toEqual([shop.id]);
    const notListed = await ctx
      .http()
      .get('/api/v1/admin/businesses')
      .query({ listed: 'false' })
      .set(bearer(reviewer.accessToken))
      .expect(200);
    expect(notListed.body.data.map((b: { id: string }) => b.id)).not.toContain(shop.id);

    // The lister manages it in the business portal like any owner.
    const mine = (await ctx.http().get('/api/v1/me/businesses').set(bearer(lister.accessToken)).expect(200))
      .body.data;
    expect(mine.map((b: { id: string }) => b.id)).toContain(shop.id);

    const activity = await ctx
      .http()
      .get('/api/v1/admin/activity')
      .query({ entityId: shop.id })
      .set(bearer(reviewer.accessToken))
      .expect(200);
    expect(activity.body.data.map((a: { action: string }) => a.action)).toContain('BUSINESS_LISTED');
  });

  it('its offers run 7 days at most, need another admin to approve, and show the listing to customers', async () => {
    const shop = (await createListing(lister, listingBody({ name: 'Pizza Point Keshwapur' })).expect(201))
      .body.data;
    const offerInput = {
      title: 'Medium pizza at a flat price',
      categoryId: refs.categoryId('fast-food'),
      pricing: { type: 'PRICE_DROP', originalPrice: 39900, offerPrice: 19900 },
    };

    const tooLong = await ctx
      .http()
      .post(`/api/v1/me/businesses/${shop.id}/offers`)
      .set(bearer(lister.accessToken))
      .send({ ...offerInput, startsAt: hoursFromNow(-1), expiresAt: hoursFromNow(24 * 8) })
      .expect(201);
    const refused = await ctx
      .http()
      .post(`/api/v1/me/offers/${tooLong.body.data.id}/submit`)
      .set(bearer(lister.accessToken))
      .expect(400);
    expect(refused.body.error.fields.expiresAt).toMatch(/at most 7 days/);

    const offer = await approvedOffer(ctx, lister, reviewer, shop.id, {
      ...offerInput,
      expiresAt: hoursFromNow(24 * 6),
    });
    const pub = (await ctx.http().get(`/api/v1/offers/${offer.slug}`).expect(200)).body.data;
    expect(pub.business).toMatchObject({ listedByPlatform: true, sourceUrl: SOURCE, isVerified: false });
  });

  it('admins can change the source page of a listing, but not give one to a normal shop', async () => {
    const shop = (await createListing(lister, listingBody({ name: 'Chicken Hut Gokul Road' })).expect(201))
      .body.data;
    const next = 'https://www.example-burgers.in/offers/hubballi';
    const updated = await ctx
      .http()
      .patch(`/api/v1/admin/businesses/${shop.id}`)
      .set(bearer(reviewer.accessToken))
      .send({ sourceUrl: next })
      .expect(200);
    expect(updated.body.data.sourceUrl).toBe(next);

    const owner = await login(ctx);
    const normal = await ctx
      .http()
      .post('/api/v1/me/businesses')
      .set(bearer(owner.accessToken))
      .send({ ...listingBody({ name: 'Normal Shop' }), sourceUrl: undefined })
      .expect(201);
    expect(normal.body.data).toMatchObject({ listedByPlatform: false, sourceUrl: null });
    await ctx
      .http()
      .patch(`/api/v1/admin/businesses/${normal.body.data.id}`)
      .set(bearer(reviewer.accessToken))
      .send({ sourceUrl: next })
      .expect(400);
    // Owners cannot set it at all.
    await ctx
      .http()
      .post('/api/v1/me/businesses')
      .set(bearer(owner.accessToken))
      .send(listingBody({ name: 'Sneaky Shop' }))
      .expect(400);
  });
});
