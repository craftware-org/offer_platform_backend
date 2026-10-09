import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from '../src/common/auth/decorators.js';
import { API_PREFIX } from '../src/common/http/api-prefix.js';
import { RetentionService } from '../src/jobs/retention.job.js';
import { Role } from '../src/modules/access-control/access-control.catalog.js';
import { AccessControlService } from '../src/modules/access-control/access-control.service.js';
import { auditLogs } from '../src/modules/audit/audit.schema.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { AuthDataService } from '../src/modules/auth/auth-data.module.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { mfaRecoveryCodes, otpChallenges, refreshTokens, userMfa } from '../src/modules/auth/auth.schema.js';
import { businessImages, businesses, businessStaff } from '../src/modules/businesses/businesses.schema.js';
import {
  analyticsEvents,
  businessFollowers,
  savedOffers,
} from '../src/modules/engagement/engagement.schema.js';
import { notifications } from '../src/modules/notifications/notifications.schema.js';
import { offers } from '../src/modules/offers/offers.schema.js';
import { users } from '../src/modules/users/users.schema.js';
import { approvedOffer, jpeg, loadRefs, verifiedBusiness } from './helpers/fixtures.js';
import {
  bearer,
  createTestApp,
  login,
  makeAdmin,
  nextTotp,
  type LoggedIn,
  type TestContext,
} from './helpers/test-app.js';

const SOME_ID = '01a0f85a-b715-7122-8c81-000000000000';

interface Route {
  method: string;
  path: string;
  isPublic: boolean;
  permissions: string[];
}

/** Every HTTP route the API serves, read from Nest's own controller registry. */
function allRoutes(ctx: TestContext): Route[] {
  const routes: Route[] = [];
  for (const module of ctx.app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as (new (...args: unknown[]) => unknown) | null;
      if (!controller) continue;
      const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
      const classPublic = Reflect.getMetadata(IS_PUBLIC_KEY, controller) === true;
      const classPermissions: string[] = Reflect.getMetadata(PERMISSIONS_KEY, controller) ?? [];
      const proto = controller.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (method === undefined) continue;
        const sub = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '');
        const path = `/${API_PREFIX}/${[base, sub].filter(Boolean).join('/')}`
          .replace(/\/+/g, '/')
          .replace(/\/$/, '');
        routes.push({
          method: RequestMethod[method]!,
          path: path.replace(/:[A-Za-z]+/g, SOME_ID),
          isPublic: classPublic || Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true,
          permissions: Reflect.getMetadata(PERMISSIONS_KEY, handler) ?? classPermissions,
        });
      }
    }
  }
  return routes;
}

describe('Phase 8 security — real Postgres + Valkey', () => {
  let ctx: TestContext;
  let superAdmin: LoggedIn;
  let customer: LoggedIn;
  let categoryId: string;
  let cityId: string;

  const send = (r: Route, token?: string) => {
    const call = ctx.http()[r.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'](r.path);
    return (token ? call.set(bearer(token)) : call).send({});
  };
  const passwordOf = 'Kadak-Chai-2026!';
  /** Sets a password for a test user (phone login) and returns its login body. */
  const withPassword = async (u: LoggedIn) => {
    await ctx
      .http()
      .post('/api/v1/auth/password')
      .set(bearer(u.accessToken))
      .send({ password: passwordOf })
      .expect(200);
    return { phone: u.phone, password: passwordOf };
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    superAdmin = await makeAdmin(ctx, await login(ctx), Role.SUPER_ADMIN);
    customer = await login(ctx);
    const refs = await loadRefs(ctx);
    categoryId = refs.categoryId('footwear');
    cityId = refs.cityId('hubballi');
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('access control on every route', () => {
    it('every non-public route refuses visitors (401) and every admin route refuses customers (403)', async () => {
      const routes = allRoutes(ctx);
      expect(routes.length).toBeGreaterThan(100);
      const privateRoutes = routes.filter((r) => !r.isPublic);
      const adminRoutes = routes.filter((r) => r.permissions.length > 0);
      expect(adminRoutes.length).toBeGreaterThan(30);

      const failures: string[] = [];
      for (const r of privateRoutes) {
        const res = await send(r);
        if (res.status !== 401) failures.push(`${r.method} ${r.path}: visitor got ${res.status}`);
      }
      for (const r of adminRoutes) {
        const res = await send(r, customer.accessToken);
        if (res.status !== 403 || res.body.error?.code !== 'FORBIDDEN')
          failures.push(`${r.method} ${r.path}: customer got ${res.status}`);
      }
      expect(failures).toEqual([]);
    });

    it('admin routes also refuse an admin whose session has not passed the authenticator step', async () => {
      const halfAdmin = await login(ctx);
      await ctx.app.get(AccessControlService).grantRole(halfAdmin.userId, Role.SUPER_ADMIN, null);
      const failures: string[] = [];
      for (const r of allRoutes(ctx).filter((x) => x.permissions.length > 0)) {
        const res = await send(r, halfAdmin.accessToken);
        if (res.status !== 403 || res.body.error?.code !== 'MFA_SETUP_REQUIRED')
          failures.push(`${r.method} ${r.path}: got ${res.status} ${res.body.error?.code}`);
      }
      expect(failures).toEqual([]);
    });
  });

  describe('2-step login with an authenticator app', () => {
    it('setting it up needs a correct first code, gives 10 recovery codes and ends other sessions', async () => {
      const u = await login(ctx);
      const oldRefresh = u.refreshToken;
      await ctx.app.get(AccessControlService).grantRole(u.userId, Role.ADMIN, null);
      const setup = await ctx.http().post('/api/v1/me/mfa/setup').set(bearer(u.accessToken)).expect(200);
      expect(setup.body.data.otpauthUrl).toMatch(/^otpauth:\/\/totp\/.+\?secret=[A-Z2-7]+&issuer=/);
      expect(setup.body.data.qrDataUrl).toMatch(/^data:image\/png;base64,/);
      const wrong = await ctx
        .http()
        .post('/api/v1/me/mfa/enable')
        .set(bearer(u.accessToken))
        .send({ code: '000000' })
        .expect(401);
      expect(wrong.body.error.code).toBe('MFA_INVALID');

      await makeAdmin(ctx, u, Role.ADMIN); // confirms with a correct code (same pending setup is replaced)
      const [row] = await ctx.db.select().from(userMfa).where(eq(userMfa.userId, u.userId));
      expect(row!.secretEnc).toMatch(/^v1\./); // encrypted at rest
      expect(
        await ctx.db.select().from(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, u.userId)),
      ).toHaveLength(10);
      await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken: oldRefresh }).expect(401);
      await ctx.http().get('/api/v1/admin/users').set(bearer(u.accessToken)).expect(200);
      const status = await ctx.http().get('/api/v1/me/mfa').set(bearer(u.accessToken)).expect(200);
      expect(status.body.data).toMatchObject({ enabled: true, recoveryCodesLeft: 10 });
    });

    it('logins (password, code, forgot password) stop at the authenticator step', async () => {
      const u = await makeAdmin(ctx, await login(ctx), Role.ADMIN);
      // set a password with a session that passed the step
      const creds = await withPassword(u);

      const pwd = await ctx.http().post('/api/v1/auth/password/login').send(creds).expect(200);
      expect(pwd.body.data).toMatchObject({ mfaRequired: true });
      expect(pwd.body.data.accessToken).toBeUndefined();
      // The challenge token is not an access token.
      await ctx.http().get('/api/v1/me/mfa').set(bearer(pwd.body.data.mfaToken)).expect(401);

      await ctx.redis.del(`rl:otp:cooldown:${u.phone}`); // the resend cooldown, not under test here
      await ctx.http().post('/api/v1/auth/otp/request').send({ phone: u.phone }).expect(202);
      const code = await ctx
        .http()
        .post('/api/v1/auth/otp/verify')
        .send({ phone: u.phone, code: ctx.sms.lastCodeFor(u.phone) })
        .expect(200);
      expect(code.body.data.mfaRequired).toBe(true);

      await ctx.redis.del(`rl:otp:cooldown:${u.phone}`); // the resend cooldown, not under test here
      await ctx.http().post('/api/v1/auth/otp/request').send({ phone: u.phone }).expect(202);
      const reset = await ctx
        .http()
        .post('/api/v1/auth/password/reset')
        .send({ phone: u.phone, code: ctx.sms.lastCodeFor(u.phone), newPassword: 'Another-Chai-2026!' })
        .expect(200);
      expect(reset.body.data.mfaRequired).toBe(true);
      expect(reset.body.data.refreshToken).toBeUndefined();

      const totp = nextTotp(u);
      const done = await ctx
        .http()
        .post('/api/v1/auth/mfa/verify')
        .send({ mfaToken: reset.body.data.mfaToken, code: totp })
        .expect(200);
      expect(done.body.data.user.id).toBe(u.userId);
      await ctx.http().get('/api/v1/admin/users').set(bearer(done.body.data.accessToken)).expect(200);
      // The session keeps the step when it rotates.
      const refreshed = await ctx
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: done.body.data.refreshToken })
        .expect(200);
      await ctx.http().get('/api/v1/admin/users').set(bearer(refreshed.body.data.accessToken)).expect(200);
      // The same code can't be used twice.
      const again = await ctx
        .http()
        .post('/api/v1/auth/password/login')
        .send({ phone: u.phone, password: 'Another-Chai-2026!' })
        .expect(200);
      const reused = await ctx
        .http()
        .post('/api/v1/auth/mfa/verify')
        .send({ mfaToken: again.body.data.mfaToken, code: totp })
        .expect(401);
      expect(reused.body.error.code).toBe('MFA_INVALID');
    });

    it('a recovery code works once; 5 wrong codes lock the step', async () => {
      const u = await login(ctx);
      await ctx.app.get(AccessControlService).grantRole(u.userId, Role.ADMIN, null);
      const setup = await ctx.http().post('/api/v1/me/mfa/setup').set(bearer(u.accessToken)).expect(200);
      const { base32Decode, stepAt, totpCode } = await import('../src/modules/auth/totp.js');
      const enabled = await ctx
        .http()
        .post('/api/v1/me/mfa/enable')
        .set(bearer(u.accessToken))
        .send({ code: totpCode(base32Decode(setup.body.data.secret), stepAt(new Date())) })
        .expect(200);
      const [recovery] = enabled.body.data.recoveryCodes as string[];
      const creds = await (async () => {
        await ctx
          .http()
          .post('/api/v1/auth/password')
          .set(bearer(enabled.body.data.tokens.accessToken))
          .send({ password: passwordOf })
          .expect(200);
        return { phone: u.phone, password: passwordOf };
      })();

      const first = await ctx.http().post('/api/v1/auth/password/login').send(creds).expect(200);
      await ctx
        .http()
        .post('/api/v1/auth/mfa/verify')
        .send({ mfaToken: first.body.data.mfaToken, recoveryCode: recovery!.toLowerCase() })
        .expect(200);
      const second = await ctx.http().post('/api/v1/auth/password/login').send(creds).expect(200);
      await ctx
        .http()
        .post('/api/v1/auth/mfa/verify')
        .send({ mfaToken: second.body.data.mfaToken, recoveryCode: recovery })
        .expect(401);

      for (let i = 0; i < 4; i++) {
        await ctx
          .http()
          .post('/api/v1/auth/mfa/verify')
          .send({ mfaToken: second.body.data.mfaToken, code: '000000' })
          .expect(401);
      }
      const locked = await ctx
        .http()
        .post('/api/v1/auth/mfa/verify')
        .send({ mfaToken: second.body.data.mfaToken, code: '000000' });
      expect(locked.status).toBe(429);
      const audit = await ctx.db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, u.userId), eq(auditLogs.action, 'MFA_RECOVERY_CODE_USED')));
      expect(audit).toHaveLength(1);
    });

    it('a Super admin can reset a lost authenticator; turning it off needs a code', async () => {
      const u = await makeAdmin(ctx, await login(ctx), Role.ADMIN);
      await ctx
        .http()
        .post(`/api/v1/admin/users/${u.userId}/mfa/reset`)
        .set(bearer(u.accessToken))
        .expect(403); // needs roles:assign
      await ctx
        .http()
        .post(`/api/v1/admin/users/${u.userId}/mfa/reset`)
        .set(bearer(superAdmin.accessToken))
        .expect(204);
      // Admin access ends at once, even with an access token that hasn't expired yet; the session ended.
      const cut = await ctx.http().get('/api/v1/admin/users').set(bearer(u.accessToken)).expect(403);
      expect(cut.body.error.code).toBe('MFA_SETUP_REQUIRED');
      await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken: u.refreshToken }).expect(401);
      await ctx.redis.del(`rl:otp:cooldown:${u.phone}`);
      const relog = await login(ctx, { input: u.phone, e164: u.phone });
      const res = await ctx.http().get('/api/v1/admin/users').set(bearer(relog.accessToken)).expect(403);
      expect(res.body.error.code).toBe('MFA_SETUP_REQUIRED');

      const v = await makeAdmin(ctx, await login(ctx), Role.ADMIN);
      await ctx
        .http()
        .post('/api/v1/me/mfa/disable')
        .set(bearer(v.accessToken))
        .send({ code: '123456' })
        .expect(401);
      await ctx
        .http()
        .post('/api/v1/me/mfa/disable')
        .set(bearer(v.accessToken))
        .send({ code: nextTotp(v) })
        .expect(204);
      expect(await ctx.db.select().from(userMfa).where(eq(userMfa.userId, v.userId))).toHaveLength(0);
    });
  });

  describe('account deletion erases personal data end to end', () => {
    it("closes the owner's shop, ends its offers, deletes the owner photo, sessions, inbox, saves and follows", async () => {
      const owner = await login(ctx);
      const fan = await login(ctx);
      const shop = await verifiedBusiness(ctx, owner, superAdmin, {
        name: 'Closing Shoes',
        categoryId,
        cityId,
        latitude: 15.36,
        longitude: 75.13,
      });
      // An owner photo can only be added before review, so this second shop gets one before submitting.
      const second = await ctx
        .http()
        .post('/api/v1/me/businesses')
        .set(bearer(owner.accessToken))
        .send({
          name: 'Second Branch',
          categoryId,
          phone: '0836 225 5124',
          location: { addressLine1: 'Shop 2', cityId, latitude: 15.36, longitude: 75.13 },
        })
        .expect(201);
      await ctx
        .http()
        .post(`/api/v1/me/businesses/${second.body.data.id}/images`)
        .query({ kind: 'VERIFICATION_OWNER' })
        .set(bearer(owner.accessToken))
        .attach('file', await jpeg(), 'owner.jpg')
        .expect(201);
      const offer = await approvedOffer(ctx, owner, superAdmin, shop.id, {
        title: 'Closing sale',
        categoryId,
        pricing: { type: 'PERCENTAGE_OFF', discountPercent: 10 },
      });
      await ctx
        .http()
        .post('/api/v1/me/saved-offers')
        .set(bearer(fan.accessToken))
        .send({ offerId: offer.id })
        .expect(204);
      await ctx
        .http()
        .post('/api/v1/me/follows')
        .set(bearer(fan.accessToken))
        .send({ businessId: shop.id })
        .expect(204);
      await ctx
        .http()
        .post('/api/v1/events')
        .set(bearer(fan.accessToken))
        .send({ type: 'CALL_CLICKED', offerId: offer.id })
        .expect(204);

      await ctx.http().delete('/api/v1/auth/account').set(bearer(owner.accessToken)).expect(204);

      const [user] = await ctx.db.select().from(users).where(eq(users.id, owner.userId));
      expect(user).toMatchObject({
        status: 'DELETED',
        phone: null,
        email: null,
        name: null,
        phoneVerifiedAt: null,
        passwordHash: null,
      });
      const shops = await ctx.db
        .select()
        .from(businesses)
        .where(inArray(businesses.id, [shop.id, second.body.data.id]));
      expect(shops.map((s) => s.status)).toEqual(['CLOSED', 'CLOSED']);
      const [ended] = await ctx.db.select().from(offers).where(eq(offers.id, offer.id));
      expect(ended).toMatchObject({ status: 'EXPIRED', statusReason: 'The shop was closed' });
      expect(
        await ctx.db
          .select()
          .from(businessImages)
          .where(
            and(
              eq(businessImages.businessId, second.body.data.id),
              eq(businessImages.kind, 'VERIFICATION_OWNER'),
            ),
          ),
      ).toHaveLength(0);
      expect(
        await ctx.db.select().from(businessStaff).where(eq(businessStaff.userId, owner.userId)),
      ).toHaveLength(0);
      expect(
        await ctx.db.select().from(refreshTokens).where(eq(refreshTokens.userId, owner.userId)),
      ).toHaveLength(0);
      expect(
        await ctx.db.select().from(otpChallenges).where(eq(otpChallenges.destination, owner.phone)),
      ).toHaveLength(0);
      expect(
        await ctx.db.select().from(notifications).where(eq(notifications.userId, owner.userId)),
      ).toHaveLength(0);
      // The shop is gone from public pages and can't be brought back.
      await ctx.http().get(`/api/v1/businesses/${shop.slug}`).expect(404);
      const reactivate = await ctx
        .http()
        .patch(`/api/v1/admin/businesses/${shop.id}/status`)
        .set(bearer(superAdmin.accessToken))
        .send({ action: 'REACTIVATE' });
      expect(reactivate.status).toBe(409);

      // The fan deletes their account too: saves and follows go, taps stay counted without them.
      await ctx.http().delete('/api/v1/auth/account').set(bearer(fan.accessToken)).expect(204);
      expect(await ctx.db.select().from(savedOffers).where(eq(savedOffers.userId, fan.userId))).toHaveLength(
        0,
      );
      expect(
        await ctx.db.select().from(businessFollowers).where(eq(businessFollowers.userId, fan.userId)),
      ).toHaveLength(0);
      const taps = await ctx.db
        .select()
        .from(analyticsEvents)
        .where(and(eq(analyticsEvents.offerId, offer.id), eq(analyticsEvents.type, 'CALL_CLICKED')));
      expect(taps).toHaveLength(1);
      expect(taps[0]!.userId).toBeNull();
      const [record] = await ctx.db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, owner.userId), eq(auditLogs.action, 'USER_DELETED_ACCOUNT')));
      const byText = (x: string, y: string) => x.localeCompare(y);
      expect([...(record!.newValue as { closedBusinesses: string[] }).closedBusinesses].sort(byText)).toEqual(
        [shop.id, second.body.data.id as string].sort(byText),
      );
    });
  });

  it('the nightly retention job deletes old personal data and keeps recent data', async () => {
    const u = await login(ctx);
    const old = (days: number) => new Date(Date.now() - days * 86_400_000);
    await ctx.db
      .insert(otpChallenges)
      .values({
        channel: 'SMS',
        destination: '+910000000001',
        codeHash: 'x'.repeat(64),
        maxAttempts: 5,
        expiresAt: old(100),
        createdAt: old(100),
      });
    await ctx.db
      .insert(refreshTokens)
      .values({
        userId: u.userId,
        familyId: SOME_ID,
        tokenHash: 'y'.repeat(64),
        expiresAt: old(95),
        createdAt: old(130),
      });
    await ctx.db
      .insert(notifications)
      .values({
        userId: u.userId,
        type: 'ADMIN_DAILY_SUMMARY',
        title: 'old',
        body: 'old',
        inApp: true,
        createdAt: old(400),
      });
    await ctx.db
      .insert(notifications)
      .values({
        userId: u.userId,
        type: 'ADMIN_DAILY_SUMMARY',
        title: 'recent',
        body: 'recent',
        inApp: true,
        createdAt: old(30),
      });
    await ctx.db
      .insert(auditLogs)
      .values({
        actorUserId: null,
        action: 'USER_REGISTERED',
        entityType: 'user',
        entityId: u.userId,
        createdAt: old(8 * 366),
      });

    // The job runs in the worker; here it is built from the API's own services.
    const retention = new RetentionService(
      ctx.app.get(AuthDataService),
      ctx.app.get(NotificationsService),
      ctx.app.get(AuditService),
    );
    const result = await retention.run();
    expect(result.loginCodes).toBeGreaterThanOrEqual(1);
    expect(result.sessions).toBeGreaterThanOrEqual(1);
    expect(result.notifications).toBe(1);
    expect(result.activityLog).toBe(1);
    expect(
      (await ctx.db.select().from(notifications).where(eq(notifications.userId, u.userId))).map(
        (n) => n.title,
      ),
    ).toEqual(['recent']);
    // The user's current session (from login) is kept.
    const [{ live }] = (
      await ctx.db.execute<{ live: number }>(
        sql`SELECT count(*)::int AS live FROM refresh_tokens WHERE user_id = ${u.userId} AND revoked_at IS NULL`,
      )
    ).rows as [{ live: number }];
    expect(live).toBe(1);
  });
});
