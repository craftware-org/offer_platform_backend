import { Role } from '../src/modules/access-control/access-control.catalog.js';
import { AccessControlService } from '../src/modules/access-control/access-control.service.js';
import { bearer, createTestApp, login, type LoggedIn, type TestContext } from './helpers/test-app.js';

describe('Admin: users, roles and audit — real Postgres + Valkey', () => {
  let ctx: TestContext;
  let superAdmin: LoggedIn;
  let admin: LoggedIn;
  let customer: LoggedIn;

  const grant = (userId: string, role: Role) =>
    ctx.app.get(AccessControlService).grantRole(userId, role, null);

  beforeAll(async () => {
    ctx = await createTestApp();
    [superAdmin, admin, customer] = [await login(ctx), await login(ctx), await login(ctx)];
    await grant(superAdmin.userId, Role.SUPER_ADMIN);
    await grant(admin.userId, Role.ADMIN);
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('authorization is enforced on the backend', () => {
    it.each([
      ['GET', '/api/v1/admin/users'],
      ['GET', '/api/v1/admin/audit-logs'],
    ])('%s %s: 401 without token, 403 for a customer', async (_method, path) => {
      await ctx.http().get(path).expect(401);
      const res = await ctx.http().get(path).set(bearer(customer.accessToken)).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('an ADMIN can read users but cannot assign roles', async () => {
      await ctx.http().get('/api/v1/admin/users').set(bearer(admin.accessToken)).expect(200);
      await ctx
        .http()
        .post(`/api/v1/admin/users/${customer.userId}/roles`)
        .set(bearer(admin.accessToken))
        .send({ role: 'ADMIN' })
        .expect(403);
    });

    it('permission changes apply immediately to existing tokens', async () => {
      const user = await login(ctx);
      await ctx.http().get('/api/v1/admin/users').set(bearer(user.accessToken)).expect(403);
      await grant(user.userId, Role.ADMIN);
      await ctx.http().get('/api/v1/admin/users').set(bearer(user.accessToken)).expect(200);
    });
  });

  describe('user management', () => {
    it('searches users by phone with pagination metadata', async () => {
      const res = await ctx
        .http()
        .get('/api/v1/admin/users')
        .query({ search: customer.phone.slice(-7), pageSize: 5 })
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(res.body.data.map((u: { id: string }) => u.id)).toContain(customer.userId);
      expect(res.body.meta).toMatchObject({ page: 1, pageSize: 5 });
    });

    it('treats search input literally (LIKE wildcards are escaped)', async () => {
      const res = await ctx
        .http()
        .get('/api/v1/admin/users')
        .query({ search: '%' })
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('caps page size at 50', async () => {
      const res = await ctx
        .http()
        .get('/api/v1/admin/users')
        .query({ pageSize: 51 })
        .set(bearer(admin.accessToken))
        .expect(400);
      expect(res.body.error.fields).toHaveProperty('pageSize');
    });

    it('validates path ids and reports the parameter name', async () => {
      const res = await ctx
        .http()
        .get('/api/v1/admin/users/not-a-uuid')
        .set(bearer(admin.accessToken))
        .expect(400);
      expect(res.body.error.fields).toEqual({ id: expect.any(String) });
    });

    it('suspends and reactivates a user, with a reason, audited', async () => {
      const target = await login(ctx);
      const suspended = await ctx
        .http()
        .patch(`/api/v1/admin/users/${target.userId}/status`)
        .set(bearer(admin.accessToken))
        .send({ status: 'SUSPENDED', reason: 'Fake offers reported' })
        .expect(200);
      expect(suspended.body.data.status).toBe('SUSPENDED');
      await ctx.http().get('/api/v1/users/me').set(bearer(target.accessToken)).expect(403);

      await ctx
        .http()
        .patch(`/api/v1/admin/users/${target.userId}/status`)
        .set(bearer(admin.accessToken))
        .send({ status: 'ACTIVE', reason: 'Resolved after review' })
        .expect(200);
      await ctx.http().get('/api/v1/users/me').set(bearer(target.accessToken)).expect(200);

      const audit = await ctx
        .http()
        .get('/api/v1/admin/audit-logs')
        .query({ entityId: target.userId })
        .set(bearer(admin.accessToken))
        .expect(200);
      const actions = audit.body.data.map((a: { action: string }) => a.action);
      expect(actions).toEqual(['USER_REACTIVATED', 'USER_SUSPENDED', 'USER_REGISTERED']);
      expect(audit.body.data[1]).toMatchObject({
        actorUserId: admin.userId,
        oldValue: { status: 'ACTIVE' },
        newValue: { status: 'SUSPENDED', reason: 'Fake offers reported' },
      });
    });

    it('requires a reason to change status', async () => {
      await ctx
        .http()
        .patch(`/api/v1/admin/users/${customer.userId}/status`)
        .set(bearer(admin.accessToken))
        .send({ status: 'SUSPENDED' })
        .expect(400);
    });

    it('an admin cannot change their own status', async () => {
      const res = await ctx
        .http()
        .patch(`/api/v1/admin/users/${admin.userId}/status`)
        .set(bearer(admin.accessToken))
        .send({ status: 'SUSPENDED', reason: 'testing self' })
        .expect(403);
      expect(res.body.error.message).toContain('own account');
    });

    it('returns 404 for an unknown user', async () => {
      await ctx
        .http()
        .get('/api/v1/admin/users/01a0f1de-0000-7000-8000-000000000000')
        .set(bearer(admin.accessToken))
        .expect(404);
    });
  });

  describe('role assignment (SUPER_ADMIN only)', () => {
    it('grants and revokes ADMIN, audited', async () => {
      const target = await login(ctx);
      const granted = await ctx
        .http()
        .post(`/api/v1/admin/users/${target.userId}/roles`)
        .set(bearer(superAdmin.accessToken))
        .send({ role: 'ADMIN' })
        .expect(201);
      expect(granted.body.data.roles).toEqual(['ADMIN', 'CUSTOMER']);

      const revoked = await ctx
        .http()
        .delete(`/api/v1/admin/users/${target.userId}/roles/ADMIN`)
        .set(bearer(superAdmin.accessToken))
        .expect(200);
      expect(revoked.body.data.roles).toEqual(['CUSTOMER']);

      const audit = await ctx
        .http()
        .get('/api/v1/admin/audit-logs')
        .query({ entityId: target.userId, action: 'ROLE_GRANTED' })
        .set(bearer(superAdmin.accessToken))
        .expect(200);
      expect(audit.body.data).toHaveLength(1);
      expect(audit.body.data[0]).toMatchObject({
        actorUserId: superAdmin.userId,
        newValue: { role: 'ADMIN' },
      });
    });

    it('business and customer roles cannot be assigned through the admin API', async () => {
      await ctx
        .http()
        .post(`/api/v1/admin/users/${customer.userId}/roles`)
        .set(bearer(superAdmin.accessToken))
        .send({ role: 'BUSINESS_OWNER' })
        .expect(400);
    });

    it('a super admin cannot remove their own SUPER_ADMIN role', async () => {
      await ctx
        .http()
        .delete(`/api/v1/admin/users/${superAdmin.userId}/roles/SUPER_ADMIN`)
        .set(bearer(superAdmin.accessToken))
        .expect(403);
    });
  });
});
