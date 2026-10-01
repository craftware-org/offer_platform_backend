import sharp from 'sharp';
import { bearer, type LoggedIn, type TestContext } from './test-app.js';

export const jpeg = () =>
  sharp({ create: { width: 800, height: 600, channels: 3, background: '#3399cc' } })
    .jpeg()
    .toBuffer();

export const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

export interface Refs {
  cityId: (slug: string) => string;
  categoryId: (slug: string) => string;
}

/** Looks up seeded cities and categories by slug. */
export async function loadRefs(ctx: TestContext): Promise<Refs> {
  const cities = (await ctx.http().get('/api/v1/cities').expect(200)).body.data as {
    id: string;
    slug: string;
  }[];
  const tree = (await ctx.http().get('/api/v1/categories').expect(200)).body.data as {
    id: string;
    slug: string;
    children: { id: string; slug: string }[];
  }[];
  const flat = tree.flatMap((p) => [p, ...p.children]);
  const find = <T extends { slug: string; id: string }>(list: T[], slug: string) => {
    const hit = list.find((x) => x.slug === slug);
    if (!hit) throw new Error(`Unknown slug ${slug}`);
    return hit.id;
  };
  return { cityId: (s) => find(cities, s), categoryId: (s) => find(flat, s) };
}

/** Registers a business at a location and takes it through verification. */
export async function verifiedBusiness(
  ctx: TestContext,
  owner: LoggedIn,
  verifier: LoggedIn,
  input: {
    name: string;
    categoryId: string;
    cityId: string;
    latitude: number;
    longitude: number;
    localityId?: string;
  },
): Promise<{ id: string; slug: string }> {
  const biz = await ctx
    .http()
    .post('/api/v1/me/businesses')
    .set(bearer(owner.accessToken))
    .send({
      name: input.name,
      categoryId: input.categoryId,
      phone: '0836 225 5123',
      location: {
        addressLine1: 'Shop 1, Main Road',
        cityId: input.cityId,
        localityId: input.localityId,
        latitude: input.latitude,
        longitude: input.longitude,
      },
    })
    .expect(201);
  const id: string = biz.body.data.id;
  await ctx
    .http()
    .post(`/api/v1/me/businesses/${id}/images`)
    .query({ kind: 'VERIFICATION_SHOP' })
    .set(bearer(owner.accessToken))
    .attach('file', await jpeg(), 'shop.jpg')
    .expect(201);
  await ctx.http().post(`/api/v1/me/businesses/${id}/submit`).set(bearer(owner.accessToken)).expect(200);
  await ctx
    .http()
    .patch(`/api/v1/admin/businesses/${id}/status`)
    .set(bearer(verifier.accessToken))
    .send({ action: 'VERIFY' })
    .expect(200);
  return { id, slug: biz.body.data.slug };
}

/** Creates, submits and approves an offer; returns its id and slug. */
export async function approvedOffer(
  ctx: TestContext,
  owner: LoggedIn,
  admin: LoggedIn,
  businessId: string,
  input: Record<string, unknown>,
): Promise<{ id: string; slug: string }> {
  const created = await ctx
    .http()
    .post(`/api/v1/me/businesses/${businessId}/offers`)
    .set(bearer(owner.accessToken))
    .send({ startsAt: hoursFromNow(-1), expiresAt: hoursFromNow(24 * 7), ...input })
    .expect(201);
  const id: string = created.body.data.id;
  await ctx.http().post(`/api/v1/me/offers/${id}/submit`).set(bearer(owner.accessToken)).expect(200);
  const approved = await ctx
    .http()
    .patch(`/api/v1/admin/offers/${id}/status`)
    .set(bearer(admin.accessToken))
    .send({ action: 'APPROVE' })
    .expect(200);
  return { id, slug: approved.body.data.slug };
}
