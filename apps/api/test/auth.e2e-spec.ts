import { and, eq } from 'drizzle-orm';
import { auditLogs } from '../src/modules/audit/audit.schema.js';
import { otpChallenges, refreshTokens } from '../src/modules/auth/auth.schema.js';
import { users } from '../src/modules/users/users.schema.js';
import { bearer, createTestApp, login, uniquePhone, type TestContext } from './helpers/test-app.js';

const OTP_REQUEST = '/api/v1/auth/otp/request';
const OTP_VERIFY = '/api/v1/auth/otp/verify';

describe('Authentication (phone OTP) — real Postgres + Valkey', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('platform basics', () => {
    it('reports readiness of database and redis', async () => {
      const res = await ctx.http().get('/api/v1/health/ready').expect(200);
      expect(res.body).toEqual({
        success: true,
        data: { status: 'ready', checks: { database: true, redis: true } },
      });
    });

    it('requires authentication by default', async () => {
      const res = await ctx.http().get('/api/v1/users/me').expect(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(res.body.requestId).toEqual(expect.any(String));
    });

    it('echoes a safe caller request id and replaces unsafe ones', async () => {
      const ok = await ctx.http().get('/api/v1/health').set('X-Request-Id', 'abc-123').expect(200);
      expect(ok.headers['x-request-id']).toBe('abc-123');
      const unsafe = await ctx
        .http()
        .get('/api/v1/health')
        .set('X-Request-Id', 'bad id <script>')
        .expect(200);
      expect(unsafe.headers['x-request-id']).not.toBe('bad id <script>');
    });

    it('returns a clean error envelope for malformed JSON', async () => {
      const res = await ctx
        .http()
        .post(OTP_REQUEST)
        .set('Content-Type', 'application/json')
        .send('{bad')
        .expect(400);
      expect(res.body.error).toEqual({ code: 'BAD_REQUEST', message: 'Malformed JSON body' });
      expect(res.body.requestId).toEqual(expect.any(String));
    });

    it('sets security headers', async () => {
      const res = await ctx.http().get('/api/v1/health').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('OTP request', () => {
    it('rejects invalid phone numbers with a field error', async () => {
      const res = await ctx.http().post(OTP_REQUEST).send({ phone: '12345' }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fields).toEqual({ phone: 'Invalid phone number' });
    });

    it('rejects unknown fields', async () => {
      const res = await ctx.http().post(OTP_REQUEST).send({ phone: '9845012345', admin: true }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('stores only an HMAC of the code, never the code itself', async () => {
      const phone = uniquePhone();
      await ctx.http().post(OTP_REQUEST).send({ phone: phone.input }).expect(202);
      const code = ctx.sms.lastCodeFor(phone.e164);
      const [row] = await ctx.db
        .select()
        .from(otpChallenges)
        .where(eq(otpChallenges.destination, phone.e164));
      expect(row?.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row?.codeHash).not.toContain(code);
    });

    it('enforces the resend cooldown with Retry-After', async () => {
      const phone = uniquePhone();
      await ctx.http().post(OTP_REQUEST).send({ phone: phone.input }).expect(202);
      const res = await ctx.http().post(OTP_REQUEST).send({ phone: phone.input }).expect(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('a new code invalidates the previous one', async () => {
      const phone = uniquePhone();
      await ctx.http().post(OTP_REQUEST).send({ phone: phone.input }).expect(202);
      const first = ctx.sms.lastCodeFor(phone.e164);
      await ctx.redis.del(`rl:otp:cooldown:${phone.e164}`);
      await ctx.http().post(OTP_REQUEST).send({ phone: phone.input }).expect(202);
      const second = ctx.sms.lastCodeFor(phone.e164);
      if (first !== second) {
        await ctx.http().post(OTP_VERIFY).send({ phone: phone.input, code: first }).expect(400);
      }
      await ctx.http().post(OTP_VERIFY).send({ phone: phone.input, code: second }).expect(200);
    });
  });

  describe('OTP verify and registration', () => {
    it('first login creates a CUSTOMER account; the next login reuses it', async () => {
      const phone = uniquePhone();
      await ctx
        .http()
        .post(OTP_REQUEST)
        .send({ phone: `+91 ${phone.input}` })
        .expect(202);
      const first = await ctx
        .http()
        .post(OTP_VERIFY)
        .send({ phone: phone.input, code: ctx.sms.lastCodeFor(phone.e164) })
        .expect(200);
      expect(first.body.data.isNewUser).toBe(true);
      expect(first.body.data.user).toMatchObject({
        phone: phone.e164,
        status: 'ACTIVE',
        roles: ['CUSTOMER'],
      });
      expect(first.body.data.accessTokenExpiresIn).toBe(900);

      await ctx.redis.del(`rl:otp:cooldown:${phone.e164}`);
      const again = await login(ctx, phone);
      expect(again.userId).toBe(first.body.data.user.id);

      const audit = await ctx.db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, again.userId), eq(auditLogs.action, 'USER_REGISTERED')));
      expect(audit).toHaveLength(1);
    });

    it('a code can be used only once', async () => {
      const phone = uniquePhone();
      await ctx.http().post(OTP_REQUEST).send({ phone: phone.input }).expect(202);
      const code = ctx.sms.lastCodeFor(phone.e164);
      await ctx.http().post(OTP_VERIFY).send({ phone: phone.input, code }).expect(200);
      const reuse = await ctx.http().post(OTP_VERIFY).send({ phone: phone.input, code }).expect(400);
      expect(reuse.body.error.code).toBe('OTP_INVALID');
    });

    it('locks the code after the maximum number of wrong attempts', async () => {
      const phone = uniquePhone();
      await ctx.http().post(OTP_REQUEST).send({ phone: phone.input }).expect(202);
      const code = ctx.sms.lastCodeFor(phone.e164);
      const wrong = code === '000000' ? '111111' : '000000';

      for (let remaining = 4; remaining >= 1; remaining--) {
        const res = await ctx.http().post(OTP_VERIFY).send({ phone: phone.input, code: wrong }).expect(400);
        expect(res.body.error.message).toContain(`${remaining} attempt`);
      }
      const fifth = await ctx.http().post(OTP_VERIFY).send({ phone: phone.input, code: wrong }).expect(400);
      expect(fifth.body.error.code).toBe('OTP_ATTEMPTS_EXCEEDED');
      const correctButLocked = await ctx
        .http()
        .post(OTP_VERIFY)
        .send({ phone: phone.input, code })
        .expect(400);
      expect(correctButLocked.body.error.code).toBe('OTP_ATTEMPTS_EXCEEDED');
    });

    it('rejects an expired code', async () => {
      const phone = uniquePhone();
      await ctx.http().post(OTP_REQUEST).send({ phone: phone.input }).expect(202);
      await ctx.db
        .update(otpChallenges)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(otpChallenges.destination, phone.e164));
      const res = await ctx
        .http()
        .post(OTP_VERIFY)
        .send({ phone: phone.input, code: ctx.sms.lastCodeFor(phone.e164) })
        .expect(400);
      expect(res.body.error.code).toBe('OTP_INVALID');
    });
  });

  describe('tokens and sessions', () => {
    it('rejects tampered access tokens', async () => {
      const user = await login(ctx);
      await ctx
        .http()
        .get('/api/v1/users/me')
        .set(bearer(`${user.accessToken}x`))
        .expect(401);
      await ctx.http().get('/api/v1/users/me').set(bearer(user.accessToken)).expect(200);
    });

    it('rotates refresh tokens; reusing an old one revokes the whole session', async () => {
      const user = await login(ctx);
      const rotated = await ctx
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(200);
      const newRefresh: string = rotated.body.data.refreshToken;
      expect(newRefresh).not.toBe(user.refreshToken);

      const theft = await ctx
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(401);
      expect(theft.body.error.code).toBe('INVALID_REFRESH_TOKEN');
      await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken: newRefresh }).expect(401);

      const live = await ctx.db.select().from(refreshTokens).where(eq(refreshTokens.userId, user.userId));
      expect(live.every((t) => t.revokedAt !== null)).toBe(true);
      const audit = await ctx.db
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.entityId, user.userId), eq(auditLogs.action, 'REFRESH_TOKEN_REUSE_DETECTED')),
        );
      expect(audit).toHaveLength(1);
    });

    it('logout ends the session', async () => {
      const user = await login(ctx);
      await ctx.http().post('/api/v1/auth/logout').send({ refreshToken: user.refreshToken }).expect(204);
      await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
    });

    it('stores refresh tokens only as hashes', async () => {
      const user = await login(ctx);
      const rows = await ctx.db.select().from(refreshTokens).where(eq(refreshTokens.userId, user.userId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0]?.tokenHash).not.toBe(user.refreshToken);
    });
  });

  describe('suspended and deleted accounts', () => {
    it('a suspended user cannot use tokens, refresh or log in', async () => {
      const user = await login(ctx);
      await ctx.db.update(users).set({ status: 'SUSPENDED' }).where(eq(users.id, user.userId));

      const me = await ctx.http().get('/api/v1/users/me').set(bearer(user.accessToken)).expect(403);
      expect(me.body.error.code).toBe('ACCOUNT_SUSPENDED');
      await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken }).expect(403);

      await ctx.redis.del(`rl:otp:cooldown:${user.phone}`);
      await ctx.http().post(OTP_REQUEST).send({ phone: user.phone }).expect(202);
      const relogin = await ctx
        .http()
        .post(OTP_VERIFY)
        .send({ phone: user.phone, code: ctx.sms.lastCodeFor(user.phone) })
        .expect(403);
      expect(relogin.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('account deletion erases personal data and ends all sessions; the phone can register again', async () => {
      const phone = uniquePhone();
      const user = await login(ctx, phone);
      await ctx
        .http()
        .patch('/api/v1/users/me')
        .set(bearer(user.accessToken))
        .send({ name: 'Asha', email: 'asha@example.com' })
        .expect(200);

      await ctx.http().delete('/api/v1/auth/account').set(bearer(user.accessToken)).expect(204);

      const [row] = await ctx.db.select().from(users).where(eq(users.id, user.userId));
      expect(row).toMatchObject({ status: 'DELETED', phone: null, name: null, email: null });
      expect(row?.deletedAt).not.toBeNull();
      await ctx.http().get('/api/v1/users/me').set(bearer(user.accessToken)).expect(401);
      await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);

      await ctx.redis.del(`rl:otp:cooldown:${phone.e164}`);
      const fresh = await login(ctx, phone);
      expect(fresh.userId).not.toBe(user.userId);
    });
  });

  describe('profile', () => {
    it('returns roles and permissions and updates name/email', async () => {
      const user = await login(ctx);
      const me = await ctx.http().get('/api/v1/users/me').set(bearer(user.accessToken)).expect(200);
      expect(me.body.data).toMatchObject({ id: user.userId, roles: ['CUSTOMER'], permissions: [] });

      const updated = await ctx
        .http()
        .patch('/api/v1/users/me')
        .set(bearer(user.accessToken))
        .send({ name: '  Ravi Kumar ', email: 'Ravi@Example.COM' })
        .expect(200);
      expect(updated.body.data).toMatchObject({ name: 'Ravi Kumar', email: 'ravi@example.com' });
    });

    it('rejects an email already used by another account', async () => {
      const a = await login(ctx);
      const b = await login(ctx);
      const email = `dup-${a.userId.slice(-8)}@example.com`;
      await ctx.http().patch('/api/v1/users/me').set(bearer(a.accessToken)).send({ email }).expect(200);
      const res = await ctx
        .http()
        .patch('/api/v1/users/me')
        .set(bearer(b.accessToken))
        .send({ email })
        .expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('rejects an empty update', async () => {
      const user = await login(ctx);
      await ctx.http().patch('/api/v1/users/me').set(bearer(user.accessToken)).send({}).expect(400);
    });
  });
});
