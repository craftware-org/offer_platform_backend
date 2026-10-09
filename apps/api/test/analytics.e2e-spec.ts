import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Role } from '../src/modules/access-control/access-control.catalog.js';
import { addDays, dayStart, istDay } from '../src/modules/analytics/analytics-time.js';
import { analyticsDaily, searchLogs } from '../src/modules/analytics/analytics.schema.js';
import { AnalyticsService } from '../src/modules/analytics/analytics.service.js';
import { analyticsEvents } from '../src/modules/engagement/engagement.schema.js';
import { notifications } from '../src/modules/notifications/notifications.schema.js';
import { approvedOffer, loadRefs, verifiedBusiness } from './helpers/fixtures.js';
import {
  makeAdmin,
  bearer,
  createTestApp,
  login,
  type LoggedIn,
  type TestContext,
} from './helpers/test-app.js';

const BROWSER = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36';
const BOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

describe('Phase 7 analytics — real Postgres + Valkey', () => {
  let ctx: TestContext;
  let analytics: AnalyticsService;
  let admin: LoggedIn;
  let owner: LoggedIn;
  let customer: LoggedIn;
  let business: { id: string; slug: string };
  let offer: { id: string; slug: string };
  let categoryId: string;
  let cityId: string;

  const as = (u: LoggedIn) => bearer(u.accessToken);
  /** A page view or tap as the website sends it. */
  const event = (body: Record<string, unknown>, opts: { user?: LoggedIn; ua?: string | null } = {}) => {
    let req = ctx.http().post('/api/v1/events');
    if (opts.user) req = req.set(as(opts.user));
    if (opts.ua !== null) req = req.set('User-Agent', opts.ua ?? BROWSER);
    return req.send(body);
  };
  const eventsOf = (type: 'OFFER_VIEWED' | 'BUSINESS_VIEWED' | 'CALL_CLICKED', target: string) =>
    ctx.db
      .select()
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.type, type),
          type === 'BUSINESS_VIEWED'
            ? eq(analyticsEvents.businessId, target)
            : eq(analyticsEvents.offerId, target),
        ),
      );
  /** Writes raw events directly, at a chosen time (for history the tests can't wait for). */
  const rawEvents = async (
    n: number,
    values: {
      type: 'OFFER_VIEWED' | 'CALL_CLICKED' | 'OFFER_SAVED';
      businessId: string;
      offerId: string | null;
      createdAt: Date;
    },
  ) => {
    for (let i = 0; i < n; i++) await ctx.db.insert(analyticsEvents).values(values);
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    analytics = ctx.app.get(AnalyticsService);
    admin = await login(ctx);
    await makeAdmin(ctx, admin, Role.ADMIN);
    owner = await login(ctx);
    customer = await login(ctx);
    const refs = await loadRefs(ctx);
    categoryId = refs.categoryId('footwear');
    cityId = refs.cityId('hubballi');
    business = await verifiedBusiness(ctx, owner, admin, {
      name: 'Insight Shoes',
      categoryId,
      cityId,
      latitude: 15.36,
      longitude: 75.13,
    });
    offer = await approvedOffer(ctx, owner, admin, business.id, {
      title: 'Insight running shoes',
      categoryId,
      pricing: { type: 'PERCENTAGE_OFF', discountPercent: 20 },
    });
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('counts views and taps from everyone, once per visitor per 30 minutes, skipping bots, staff and admins', async () => {
    const visitorA = randomUUID();
    const visitorB = randomUUID();
    await event({ type: 'OFFER_VIEWED', offerId: offer.id, visitorId: visitorA }).expect(204);
    await event({ type: 'OFFER_VIEWED', offerId: offer.id, visitorId: visitorA }).expect(204); // same visitor: once
    await event({ type: 'OFFER_VIEWED', offerId: offer.id, visitorId: visitorB }).expect(204);
    await event({ type: 'OFFER_VIEWED', offerId: offer.id, visitorId: randomUUID() }, { ua: BOT }).expect(
      204,
    );
    await event({ type: 'OFFER_VIEWED', offerId: offer.id, visitorId: randomUUID() }, { ua: null }).expect(
      204,
    );
    await event({ type: 'OFFER_VIEWED', offerId: offer.id }, { user: owner }).expect(204); // the shop's own staff
    await event({ type: 'OFFER_VIEWED', offerId: offer.id }, { user: admin }).expect(204);
    await event({ type: 'OFFER_VIEWED', offerId: offer.id }, { user: customer }).expect(204);
    await event({ type: 'OFFER_VIEWED', offerId: offer.id }).expect(400); // anonymous without a visitor id

    const views = await eventsOf('OFFER_VIEWED', offer.id);
    expect(views).toHaveLength(3); // A, B and the customer
    expect(views.every((v) => v.userId === null)).toBe(true); // views never store who viewed

    await event({ type: 'BUSINESS_VIEWED', businessId: business.id, visitorId: visitorA }).expect(204);
    await event({ type: 'BUSINESS_VIEWED', offerId: offer.id, visitorId: visitorA }).expect(400);
    expect(await eventsOf('BUSINESS_VIEWED', business.id)).toHaveLength(1);

    await event({ type: 'CALL_CLICKED', offerId: offer.id, visitorId: visitorA }).expect(204);
    await event({ type: 'CALL_CLICKED', offerId: offer.id }, { user: customer }).expect(204);
    const calls = await eventsOf('CALL_CLICKED', offer.id);
    expect(calls).toHaveLength(2);
    expect(calls.filter((c) => c.userId === customer.userId)).toHaveLength(1); // taps by users keep the user (Phase 5)
  });

  it('shows the owner their numbers for 7/30/90 days, with a daily series and per-offer performance', async () => {
    await ctx
      .http()
      .post('/api/v1/me/saved-offers')
      .set(as(customer))
      .send({ offerId: offer.id })
      .expect(204);
    await ctx
      .http()
      .post('/api/v1/me/follows')
      .set(as(customer))
      .send({ businessId: business.id })
      .expect(204);

    const res = await ctx
      .http()
      .get(`/api/v1/me/businesses/${business.id}/insights?days=7`)
      .set(as(owner))
      .expect(200);
    const data = res.body.data;
    expect(data.days).toBe(7);
    expect(data.range.to).toBe(istDay(new Date()));
    expect(data.totals).toMatchObject({ offerViews: 3, shopViews: 1, calls: 2, saves: 1, follows: 1 });
    expect(data.daily).toHaveLength(7);
    expect(data.daily.at(-1)).toEqual({ day: istDay(new Date()), views: 4, taps: 2 });
    const perf = data.offers.find((o: { offerId: string }) => o.offerId === offer.id);
    expect(perf).toMatchObject({
      title: 'Insight running shoes',
      views: 3,
      saves: 1,
      contactTaps: 2,
      tapsPer100Views: 66.7,
    });
    expect(data.bestOfferId).toBe(offer.id);

    await ctx.http().get(`/api/v1/me/businesses/${business.id}/insights`).set(as(customer)).expect(404);
    await ctx.http().get(`/api/v1/me/businesses/${business.id}/insights?days=15`).set(as(owner)).expect(400);
  });

  it('rolls up older days into daily totals (idempotently), keeps them after raw events are purged', async () => {
    const shop = await verifiedBusiness(ctx, owner, admin, {
      name: 'History Shop',
      categoryId,
      cityId,
      latitude: 15.36,
      longitude: 75.13,
    });
    const old = await approvedOffer(ctx, owner, admin, shop.id, {
      title: 'Old sale',
      categoryId,
      pricing: { type: 'PERCENTAGE_OFF', discountPercent: 10 },
    });
    const today = istDay(new Date());
    const tenDaysAgo = addDays(today, -10);
    const at = new Date(dayStart(tenDaysAgo).getTime() + 3_600_000);
    await rawEvents(5, { type: 'OFFER_VIEWED', businessId: shop.id, offerId: old.id, createdAt: at });
    await rawEvents(2, { type: 'CALL_CLICKED', businessId: shop.id, offerId: old.id, createdAt: at });
    // 40 days ago: in the "previous period" of a 30-day view.
    await rawEvents(4, {
      type: 'OFFER_VIEWED',
      businessId: shop.id,
      offerId: old.id,
      createdAt: dayStart(addDays(today, -40)),
    });

    const first = await analytics.rollup();
    expect(first.days).toContain(tenDaysAgo); // catches up on every day not rolled up yet
    await analytics.rollup(); // re-running is harmless
    const daily = await ctx.db
      .select()
      .from(analyticsDaily)
      .where(and(eq(analyticsDaily.businessId, shop.id), eq(analyticsDaily.day, tenDaysAgo)));
    expect(
      daily.map((d) => [d.type, d.count]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ['CALL_CLICKED', 2],
      ['OFFER_VIEWED', 5],
    ]);

    // Raw events gone: the dashboard still shows them from the daily totals.
    await ctx.db.delete(analyticsEvents).where(eq(analyticsEvents.businessId, shop.id));
    const res = await ctx
      .http()
      .get(`/api/v1/me/businesses/${shop.id}/insights?days=30`)
      .set(as(owner))
      .expect(200);
    expect(res.body.data.totals).toMatchObject({ offerViews: 5, calls: 2 });
    expect(res.body.data.previous).toMatchObject({ offerViews: 4 });
    expect(res.body.data.daily.find((d: { day: string }) => d.day === tenDaysAgo)).toEqual({
      day: tenDaysAgo,
      views: 5,
      taps: 2,
    });

    // 180-day retention: old raw events and searches go, daily totals stay.
    const ancient = dayStart(addDays(today, -200));
    await rawEvents(1, { type: 'OFFER_VIEWED', businessId: shop.id, offerId: old.id, createdAt: ancient });
    await ctx.db.insert(searchLogs).values({ query: 'ancient search', results: 1, createdAt: ancient });
    const purged = await analytics.purge();
    expect(purged.events).toBeGreaterThanOrEqual(1);
    expect(purged.searches).toBeGreaterThanOrEqual(1);
    expect(await ctx.db.select().from(searchLogs).where(eq(searchLogs.query, 'ancient search'))).toHaveLength(
      0,
    );
    expect(
      await ctx.db.select().from(analyticsDaily).where(eq(analyticsDaily.businessId, shop.id)),
    ).not.toHaveLength(0);
  });

  it('records typed searches once per visitor (first page only, no bots) and shows them to admins', async () => {
    const search = (q: string, extra = '', ua = BROWSER) =>
      ctx
        .http()
        .get(`/api/v1/discover/offers?q=${encodeURIComponent(q)}&city=hubballi${extra}`)
        .set('User-Agent', ua)
        .expect(200);
    await search('Insight  RUNNING shoes');
    await search('insight running shoes', '&sort=newest'); // same words, new sort: not a new search
    await search('insight running shoes', '&page=2');
    await search('insight running shoes', '', BOT);
    await search('golden saree 9845012345');
    await ctx.http().get('/api/v1/discover/offers?category=footwear').set('User-Agent', BROWSER).expect(200); // no words

    const rows = await ctx.db
      .select()
      .from(searchLogs)
      .where(sql`${searchLogs.query} <> 'ancient search'`);
    expect(rows.map((r) => r.query).sort()).toEqual(['golden saree #', 'insight running shoes']);
    const shoes = rows.find((r) => r.query === 'insight running shoes')!;
    expect(shoes.results).toBeGreaterThanOrEqual(1);
    expect(shoes.cityId).toBe(cityId);
    expect(rows.find((r) => r.query === 'golden saree #')!.results).toBe(0);

    const res = await ctx
      .http()
      .get('/api/v1/admin/insights?days=7&city=hubballi')
      .set(as(admin))
      .expect(200);
    const searches = res.body.data.searches;
    expect(searches.total).toBe(2);
    expect(searches.top.map((s: { query: string }) => s.query)).toContain('insight running shoes');
    expect(searches.noResults).toEqual([{ query: 'golden saree #', count: 1 }]);
  });

  it('gives admins the platform dashboard and refuses everyone else', async () => {
    await ctx.http().get('/api/v1/admin/insights').set(as(customer)).expect(403);
    await ctx.http().get('/api/v1/admin/insights').expect(401);
    const res = await ctx.http().get('/api/v1/admin/insights?days=7').set(as(admin)).expect(200);
    const d = res.body.data;
    expect(d.users.total).toBeGreaterThanOrEqual(3);
    expect(d.users.signups).toHaveLength(7);
    expect(d.users.signups.at(-1).value).toBeGreaterThanOrEqual(3);
    expect(d.users.logins.at(-1).value).toBeGreaterThanOrEqual(3);
    expect(d.users.active7).toBeGreaterThanOrEqual(3);
    expect(d.offers.liveNow).toBeGreaterThanOrEqual(2);
    expect(d.offers.liveByCity).toContainEqual({ label: 'Hubballi', value: d.offers.liveNow });
    expect(d.businesses.byStatus).toContainEqual({ status: 'VERIFIED', value: 2 });
    expect(d.queues.offers).toEqual({ waiting: 0, oldestSince: null });
    expect(d.topOffers[0]).toMatchObject({ offerId: offer.id, views: 3, business: 'Insight Shoes' });
    expect(d.engagement.totals.views).toBeGreaterThanOrEqual(4);
  });

  it('sends each active verified business one weekly summary', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
    await rawEvents(6, {
      type: 'OFFER_VIEWED',
      businessId: business.id,
      offerId: offer.id,
      createdAt: twoDaysAgo,
    });
    await analytics.rollup();
    expect(await analytics.sendWeeklySummaries()).toBeGreaterThanOrEqual(1);
    await analytics.sendWeeklySummaries(); // same week: nothing new
    const mine = await ctx.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, owner.userId), eq(notifications.type, 'BUSINESS_WEEKLY_SUMMARY')));
    const forShop = mine.filter((n) => n.link === `/business/${business.id}/insights`);
    expect(forShop).toHaveLength(1);
    expect(forShop[0]!.title).toMatch(/^Insight Shoes last week on .+: \d+ views, \d+ taps$/);
    expect(forShop[0]!.body).toContain('Best offer: “Insight running shoes”');
  });
});
