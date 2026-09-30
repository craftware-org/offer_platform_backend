import { eq } from 'drizzle-orm';
import { Role } from '../src/modules/access-control/access-control.catalog.js';
import { offers } from '../src/modules/offers/offers.schema.js';
import { AccessControlService } from '../src/modules/access-control/access-control.service.js';
import { approvedOffer, hoursFromNow, loadRefs, verifiedBusiness, type Refs } from './helpers/fixtures.js';
import { bearer, createTestApp, login, type LoggedIn, type TestContext } from './helpers/test-app.js';

// Real coordinates: Hubballi centre area, ~3 km north-west of it, and Dharwad (~16 km away).
const HUBBALLI = { latitude: 15.3602, longitude: 75.1301 };
const HUBBALLI_NW = { latitude: 15.3812, longitude: 75.1102 };
const DHARWAD = { latitude: 15.4589, longitude: 75.0078 };
const CUSTOMER = { lat: 15.3647, lng: 75.124 }; // standing near Hubballi city centre

interface Hit {
  id: string;
  title: string;
  distanceKm: number | null;
}

describe('Discovery: search, filters, nearby, ranking (real PostGIS + full-text search)', () => {
  let ctx: TestContext;
  let admin: LoggedIn;
  let refs: Refs;
  const ids: Record<string, string> = {};

  const discover = (query: Record<string, unknown>) => ctx.http().get('/api/v1/discover/offers').query(query);
  const titles = (res: { body: { data: Hit[] } }) => res.body.data.map((o) => o.title);

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await login(ctx);
    await ctx.app.get(AccessControlService).grantRole(admin.userId, Role.ADMIN, null);
    refs = await loadRefs(ctx);
    const hubballi = refs.cityId('hubballi');

    const vidyanagar = await ctx
      .http()
      .post(`/api/v1/admin/cities/${hubballi}/localities`)
      .set(bearer(admin.accessToken))
      .send({ name: 'Vidya Nagar' })
      .expect(201);

    const [a, b, c] = [await login(ctx), await login(ctx), await login(ctx)];
    const shopA = await verifiedBusiness(ctx, a, admin, {
      name: 'Vidyanagar Fashions',
      categoryId: refs.categoryId('fashion'),
      cityId: hubballi,
      localityId: vidyanagar.body.data.id,
      ...HUBBALLI,
    });
    const shopB = await verifiedBusiness(ctx, b, admin, {
      name: 'Hotel Shree Biryani House',
      categoryId: refs.categoryId('restaurants'),
      cityId: hubballi,
      ...HUBBALLI_NW,
    });
    const shopC = await verifiedBusiness(ctx, c, admin, {
      name: 'Dharwad Digital World',
      categoryId: refs.categoryId('electronics'),
      cityId: refs.cityId('dharwad'),
      ...DHARWAD,
    });

    const offer = async (key: string, owner: LoggedIn, businessId: string, input: Record<string, unknown>) => {
      ids[key] = (await approvedOffer(ctx, owner, admin, businessId, input)).id;
    };
    await offer('shirts', a, shopA.id, {
      title: "40% OFF Men's Formal Shirts",
      categoryId: refs.categoryId('fashion'),
      pricing: { type: 'PRICE_DROP', originalPrice: 199900, offerPrice: 119900 },
    });
    await offer('shoes', a, shopA.id, {
      title: 'Running Shoes Clearance',
      categoryId: refs.categoryId('footwear'),
      pricing: { type: 'PRICE_DROP', originalPrice: 349900, offerPrice: 189900 },
    });
    await offer('sarees', a, shopA.id, {
      title: 'ಸೀರೆ ಮೇಲೆ 50% ರಿಯಾಯಿತಿ',
      description: 'Silk sarees at half price',
      categoryId: refs.categoryId('fashion'),
      pricing: { type: 'PERCENTAGE_OFF', discountPercent: 50 },
    });
    await offer('biryani', b, shopB.id, {
      title: 'Family Biryani Combo',
      categoryId: refs.categoryId('restaurants'),
      pricing: { type: 'COMBO', offerPrice: 59900, originalPrice: 79900, comboItems: ['Biryani x2', 'Raita', 'Dessert'] },
      expiresAt: hoursFromNow(10), // ending soon
    });
    await offer('tv', c, shopC.id, {
      title: 'Smart TV Festival Sale',
      categoryId: refs.categoryId('electronics'),
      pricing: { type: 'PERCENTAGE_OFF', discountPercent: 30 },
    });
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('understands English word forms ("shirt" finds "Shirts")', async () => {
    const res = await discover({ q: 'shirt' }).expect(200);
    expect(titles(res)).toEqual(["40% OFF Men's Formal Shirts"]);
    expect(res.body.meta.interpretation).toMatchObject({ text: 'shirt', sort: 'relevance' });
  });

  it('tolerates typos ("restarant" finds the restaurant offer via its category)', async () => {
    const res = await discover({ q: 'restarant' }).expect(200);
    expect(titles(res)).toContain('Family Biryani Combo');
  });

  it('finds Kannada text', async () => {
    const res = await discover({ q: 'ಸೀರೆ' }).expect(200);
    expect(titles(res)).toEqual(['ಸೀರೆ ಮೇಲೆ 50% ರಿಯಾಯಿತಿ']);
  });

  it('"shoes under 2000" filters by price', async () => {
    const res = await discover({ q: 'shoes under 2000' }).expect(200);
    expect(titles(res)).toEqual(['Running Shoes Clearance']);
    expect(res.body.meta.interpretation).toMatchObject({ text: 'shoes', maxPrice: 200000 });
  });

  it('"50% discount" filters by minimum discount', async () => {
    const res = await discover({ q: '50% discount' }).expect(200);
    expect(titles(res)).toEqual(['ಸೀರೆ ಮೇಲೆ 50% ರಿಯಾಯಿತಿ']);
  });

  it('"offers near me" without a location asks the app for one', async () => {
    const res = await discover({ q: 'offers near me' }).expect(200);
    expect(res.body.meta.interpretation).toMatchObject({ nearMe: true, needsLocation: true });
  });

  it('near me (5 km) excludes Dharwad and sorts by real distance', async () => {
    const res = await discover({ ...CUSTOMER, sort: 'nearest' }).expect(200);
    const hits: Hit[] = res.body.data;
    expect(hits.map((h) => h.title)).not.toContain('Smart TV Festival Sale');
    expect(hits.length).toBe(4);
    const distances = hits.map((h) => h.distanceKm as number);
    expect([...distances].sort((x, y) => x - y)).toEqual(distances);
    expect(distances[0]).toBeLessThan(1.5);
    expect(distances.at(-1)).toBeGreaterThan(2);
    expect(res.body.meta.interpretation.radiusKm).toBe(5);
  });

  it('a 25 km radius reaches Dharwad (~16 km)', async () => {
    const res = await discover({ ...CUSTOMER, radiusKm: 25, q: 'tv' }).expect(200);
    expect(res.body.data[0]).toMatchObject({ title: 'Smart TV Festival Sale' });
    expect(res.body.data[0].distanceKm).toBeGreaterThan(14);
    expect(res.body.data[0].distanceKm).toBeLessThan(19);
  });

  it('"fashion in Vidya Nagar" resolves the locality and keeps only offers there', async () => {
    const res = await discover({ q: 'fashion in Vidya Nagar' }).expect(200);
    expect(res.body.meta.interpretation).toMatchObject({ text: 'fashion', locality: { slug: 'vidya-nagar' } });
    // All three offers of "Vidyanagar Fashions" match "fashion" (the shop's name); the biryani
    // house elsewhere in Hubballi and the Dharwad shop do not qualify.
    expect(titles(res).sort()).toEqual(
      ["40% OFF Men's Formal Shirts", 'Running Shoes Clearance', 'ಸೀರೆ ಮೇಲೆ 50% ರಿಯಾಯಿತಿ'].sort(),
    );
  });

  it('a parent category includes its subcategories ("food" → restaurants)', async () => {
    const res = await discover({ category: 'food' }).expect(200);
    expect(titles(res)).toEqual(['Family Biryani Combo']);
  });

  it('home returns nearby, recommended, new and ending-soon sections', async () => {
    const res = await ctx.http().get('/api/v1/discover/home').query(CUSTOMER).expect(200);
    expect(res.body.data.needsLocation).toBe(false);
    expect(res.body.data.nearby.length).toBe(4);
    expect(res.body.data.endingSoon.map((o: Hit) => o.title)).toEqual(['Family Biryani Combo']);
    // With a location, every section is local (5 km): the Dharwad offer (~16 km) is not included.
    expect(res.body.data.newOffers.length).toBe(4);
    expect(res.body.data.recommended.length).toBe(4);

    const noLocation = await ctx.http().get('/api/v1/discover/home').expect(200);
    expect(noLocation.body.data).toMatchObject({ needsLocation: true, nearby: [] });
    expect(noLocation.body.data.newOffers.length).toBe(5);
  });

  it('paused and expired offers disappear from discovery', async () => {
    const shirts = ids.shirts!;
    await ctx.db.update(offers).set({ status: 'PAUSED' }).where(eq(offers.id, shirts));
    expect((await discover({ q: 'shirt' }).expect(200)).body.data).toEqual([]);
    await ctx.db
      .update(offers)
      .set({ status: 'ACTIVE', expiresAt: new Date(Date.now() - 1000), startsAt: new Date(Date.now() - 7_200_000) })
      .where(eq(offers.id, shirts));
    expect((await discover({ q: 'shirt' }).expect(200)).body.data).toEqual([]); // ended, even before the worker runs
  });

  it('validates inputs', async () => {
    await discover({ lat: 15.36 }).expect(400); // lng missing
    await discover({ ...CUSTOMER, radiusKm: 100 }).expect(400);
    await discover({ sort: 'nearest' }).expect(400); // needs a location
    const hostile = await discover({ q: `shirt'; drop table offers; --` }).expect(200);
    expect(hostile.body.success).toBe(true);
  });
});
