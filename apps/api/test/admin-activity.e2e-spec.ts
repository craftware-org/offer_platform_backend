import { Role } from '../src/modules/access-control/access-control.catalog.js';
import { loadRefs, verifiedBusiness } from './helpers/fixtures.js';
import {
  makeAdmin,
  bearer,
  createTestApp,
  login,
  type LoggedIn,
  type TestContext,
} from './helpers/test-app.js';

interface Entry {
  action: string;
  entityType: string;
  entityId: string | null;
  actor: { id: string; name: string } | null;
  entityLabel: string | null;
}

describe('Admin activity feed (audit with names) — real Postgres + Valkey', () => {
  let ctx: TestContext;
  let admin: LoggedIn;
  let owner: LoggedIn;
  let customer: LoggedIn;

  beforeAll(async () => {
    ctx = await createTestApp();
    [admin, owner, customer] = [await login(ctx), await login(ctx), await login(ctx)];
    await makeAdmin(ctx, admin, Role.ADMIN);
    await ctx
      .http()
      .patch('/api/v1/users/me')
      .set(bearer(admin.accessToken))
      .send({ name: 'Ravi Admin' })
      .expect(200);
  });
  afterAll(async () => {
    await ctx.close();
  });

  const feed = async (query: Record<string, string> = {}) =>
    (await ctx.http().get('/api/v1/admin/activity').query(query).set(bearer(admin.accessToken)).expect(200))
      .body.data as Entry[];

  it('shows who did what to which item, by name', async () => {
    const refs = await loadRefs(ctx);
    const biz = await verifiedBusiness(ctx, owner, admin, {
      name: 'Activity Shoe House',
      categoryId: refs.categoryId('footwear'),
      cityId: refs.cityId('hubballi'),
      latitude: 15.36,
      longitude: 75.13,
    });

    const entries = await feed({ entityType: 'business', entityId: biz.id });
    const verified = entries.find((e) => e.action === 'BUSINESS_VERIFIED');
    expect(verified).toMatchObject({
      actor: { id: admin.userId, name: 'Ravi Admin' },
      entityLabel: 'Activity Shoe House',
    });
    // Owner without a name falls back to the phone number.
    const registered = entries.find((e) => e.action === 'BUSINESS_REGISTERED');
    expect(registered?.actor?.name).toBe(owner.phone);
  });

  it('labels areas with their city and settings with their key', async () => {
    const cities = (await ctx.http().get('/api/v1/cities').expect(200)).body.data as {
      id: string;
      slug: string;
    }[];
    const dharwad = cities.find((c) => c.slug === 'dharwad')!;
    const created = await ctx
      .http()
      .post(`/api/v1/admin/cities/${dharwad.id}/localities`)
      .set(bearer(admin.accessToken))
      .send({ name: 'Activity Nagar' })
      .expect(201);
    const [locality] = await feed({ entityType: 'locality', entityId: created.body.data.id });
    expect(locality).toMatchObject({ action: 'LOCALITY_CREATED', entityLabel: 'Activity Nagar, Dharwad' });
  });

  it('is paginated and filterable, and needs audit:read', async () => {
    const page = await ctx
      .http()
      .get('/api/v1/admin/activity')
      .query({ pageSize: 2 })
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.meta).toMatchObject({ page: 1, pageSize: 2 });

    const byActor = await feed({ actorUserId: admin.userId });
    expect(byActor.length).toBeGreaterThan(0);
    expect(byActor.every((e) => e.actor?.id === admin.userId)).toBe(true);

    await ctx.http().get('/api/v1/admin/activity').set(bearer(customer.accessToken)).expect(403);
    await ctx.http().get('/api/v1/admin/activity').expect(401);
  });
});
