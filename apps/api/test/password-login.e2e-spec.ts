import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { auditLogs } from '../src/modules/audit/audit.schema.js';
import { users } from '../src/modules/users/users.schema.js';
import { bearer, createTestApp, login, uniquePhone, type TestContext } from './helpers/test-app.js';

const OTP_REQUEST = '/api/v1/auth/otp/request';
const OTP_VERIFY = '/api/v1/auth/otp/verify';
const PWD_LOGIN = '/api/v1/auth/password/login';
const PWD_SET = '/api/v1/auth/password';
const PWD_CHANGE = '/api/v1/auth/password/change';
const PWD_RESET = '/api/v1/auth/password/reset';
const uniqueEmail = () => `pw.${randomBytes(4).toString('hex')}@example.com`;

describe('Password login (ADR-0015, real Postgres + Valkey)', () => {
  let ctx: TestContext;

  const emailCodeLogin = async (email: string) => {
    await ctx.redis.del(`rl:otp:cooldown:${email}`);
    await ctx.http().post(OTP_REQUEST).send({ email }).expect(202);
    const res = await ctx.http().post(OTP_VERIFY).send({ email, code: ctx.email.lastCodeFor(email) }).expect(200);
    return res.body.data as { accessToken: string; refreshToken: string; user: { id: string } };
  };
  const passwordLogin = (body: Record<string, string>) => ctx.http().post(PWD_LOGIN).send(body);

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    // All requests come from one IP; reset the per-IP password budget between tests.
    const keys = await ctx.redis.keys('rl:pwd:ip:*');
    if (keys.length) await ctx.redis.del(...keys);
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('email: verify once with a code, set a password, then log in with it', async () => {
    const email = uniqueEmail();
    const first = await emailCodeLogin(email);

    const weak = await ctx.http().post(PWD_SET).set(bearer(first.accessToken)).send({ password: '12345678' }).expect(400);
    expect(weak.body.error.fields.password).toContain('too common');
    await ctx.http().post(PWD_SET).set(bearer(first.accessToken)).send({ password: 'short' }).expect(400);

    const set = await ctx.http().post(PWD_SET).set(bearer(first.accessToken)).send({ password: 'mango@shop' }).expect(200);
    expect(set.body.data).toMatchObject({ hasPassword: true });
    expect(JSON.stringify(set.body)).not.toMatch(/argon2|passwordHash/);

    const res = await passwordLogin({ email: email.toUpperCase(), password: 'mango@shop' }).expect(200);
    expect(res.body.data).toMatchObject({ isNewUser: false, user: { id: first.user.id, hasPassword: true } });
    const me = await ctx.http().get('/api/v1/users/me').set(bearer(res.body.data.accessToken)).expect(200);
    expect(me.body.data.passwordHash).toBeUndefined();

    // Setting again is refused: changing needs the current password.
    await ctx.http().post(PWD_SET).set(bearer(first.accessToken)).send({ password: 'another-one' }).expect(409);

    const [row] = await ctx.db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, first.user.id));
    expect(row!.hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    const [audit] = await ctx.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, first.user.id), eq(auditLogs.action, 'PASSWORD_SET')));
    expect(audit).toBeDefined();
  });

  it('phone accounts can use a password too', async () => {
    const phone = uniquePhone();
    const user = await login(ctx, phone);
    await ctx.http().post(PWD_SET).set(bearer(user.accessToken)).send({ password: 'hubli2026' }).expect(200);
    const res = await passwordLogin({ phone: `+91 ${phone.input}`, password: 'hubli2026' }).expect(200);
    expect(res.body.data.user.id).toBe(user.userId);
  });

  it('gives one generic answer for wrong password, unknown account and account without a password', async () => {
    const email = uniqueEmail();
    const user = await emailCodeLogin(email);
    const noPassword = await passwordLogin({ email, password: 'whatever-1' }).expect(401);
    await ctx.http().post(PWD_SET).set(bearer(user.accessToken)).send({ password: 'mango@shop' }).expect(200);
    const wrong = await passwordLogin({ email, password: 'mango@shoP' }).expect(401);
    const unknown = await passwordLogin({ email: uniqueEmail(), password: 'mango@shop' }).expect(401);
    for (const r of [noPassword, wrong, unknown]) {
      expect(r.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: wrong.body.error.message });
    }
  });

  it('locks an account for 15 minutes after 5 wrong passwords, even for the right one', async () => {
    const email = uniqueEmail();
    const user = await emailCodeLogin(email);
    await ctx.http().post(PWD_SET).set(bearer(user.accessToken)).send({ password: 'mango@shop' }).expect(200);
    for (let i = 0; i < 5; i++) await passwordLogin({ email, password: `wrong-pass-${i}` }).expect(401);
    const locked = await passwordLogin({ email, password: 'mango@shop' }).expect(429);
    expect(locked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(800);

    // After the window (simulated) the right password works and the counter resets.
    await ctx.redis.del(`rl:pwd:fail:${email}`);
    await passwordLogin({ email, password: 'mango@shop' }).expect(200);
  });

  it('an email typed into a profile (unverified) never logs in with a password', async () => {
    const victim = uniqueEmail();
    const attacker = await login(ctx);
    await ctx.http().patch('/api/v1/users/me').set(bearer(attacker.accessToken)).send({ email: victim }).expect(200);
    await ctx.http().post(PWD_SET).set(bearer(attacker.accessToken)).send({ password: 'attacker-pass' }).expect(200);
    await passwordLogin({ email: victim, password: 'attacker-pass' }).expect(401);
  });

  it('change password: needs the current one, logs out every other device, returns fresh tokens', async () => {
    const email = uniqueEmail();
    const deviceA = await emailCodeLogin(email);
    await ctx.http().post(PWD_SET).set(bearer(deviceA.accessToken)).send({ password: 'mango@shop' }).expect(200);
    const deviceB = (await passwordLogin({ email, password: 'mango@shop' }).expect(200)).body.data;

    const wrong = await ctx
      .http()
      .post(PWD_CHANGE)
      .set(bearer(deviceA.accessToken))
      .send({ currentPassword: 'not-it-123', newPassword: 'papaya@shop' })
      .expect(401);
    expect(wrong.body.error.fields).toEqual({ currentPassword: 'Not correct' });
    await ctx
      .http()
      .post(PWD_CHANGE)
      .set(bearer(deviceA.accessToken))
      .send({ currentPassword: 'mango@shop', newPassword: '12345678' })
      .expect(400);

    const changed = await ctx
      .http()
      .post(PWD_CHANGE)
      .set(bearer(deviceA.accessToken))
      .send({ currentPassword: 'mango@shop', newPassword: 'papaya@shop' })
      .expect(200);
    expect(changed.body.data.refreshToken).toBeDefined();

    await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken: deviceA.refreshToken }).expect(401);
    await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken: deviceB.refreshToken }).expect(401);
    await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken: changed.body.data.refreshToken }).expect(200);
    await passwordLogin({ email, password: 'mango@shop' }).expect(401);
    await passwordLogin({ email, password: 'papaya@shop' }).expect(200);
  });

  it('forgot password: a code sent to the email resets it and ends every session', async () => {
    const email = uniqueEmail();
    const old = await emailCodeLogin(email);
    await ctx.http().post(PWD_SET).set(bearer(old.accessToken)).send({ password: 'mango@shop' }).expect(200);
    for (let i = 0; i < 5; i++) await passwordLogin({ email, password: `wrong-pass-${i}` }).expect(401);

    await ctx.redis.del(`rl:otp:cooldown:${email}`);
    await ctx.http().post(OTP_REQUEST).send({ email }).expect(202);
    const code = ctx.email.lastCodeFor(email);

    // A weak new password is refused before the code is used up.
    await ctx.http().post(PWD_RESET).send({ email, code, newPassword: 'password' }).expect(400);
    const wrongCode = code === '000000' ? '111111' : '000000';
    await ctx.http().post(PWD_RESET).send({ email, code: wrongCode, newPassword: 'guava@shop' }).expect(400);

    const reset = await ctx.http().post(PWD_RESET).send({ email, code, newPassword: 'guava@shop' }).expect(200);
    expect(reset.body.data).toMatchObject({ isNewUser: false, user: { id: old.user.id, hasPassword: true } });
    await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken: old.refreshToken }).expect(401);
    await ctx.http().post(PWD_RESET).send({ email, code, newPassword: 'other@shop1' }).expect(400); // code used

    // The reset also lifts the lock.
    await passwordLogin({ email, password: 'guava@shop' }).expect(200);
    const [audit] = await ctx.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, old.user.id), eq(auditLogs.action, 'PASSWORD_RESET')));
    expect(audit).toBeDefined();
  });

  it('suspended accounts cannot log in with a password; deleted accounts lose it', async () => {
    const email = uniqueEmail();
    const user = await emailCodeLogin(email);
    await ctx.http().post(PWD_SET).set(bearer(user.accessToken)).send({ password: 'mango@shop' }).expect(200);

    await ctx.db.update(users).set({ status: 'SUSPENDED' }).where(eq(users.id, user.user.id));
    const suspended = await passwordLogin({ email, password: 'mango@shop' }).expect(403);
    expect(suspended.body.error.code).toBe('ACCOUNT_SUSPENDED');
    await ctx.db.update(users).set({ status: 'ACTIVE' }).where(eq(users.id, user.user.id));

    await ctx.http().delete('/api/v1/auth/account').set(bearer(user.accessToken)).expect(204);
    await passwordLogin({ email, password: 'mango@shop' }).expect(401);
    const [row] = await ctx.db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.user.id));
    expect(row!.hash).toBeNull();
  });

  it('validates input', async () => {
    await passwordLogin({ password: 'mango@shop' }).expect(400);
    await passwordLogin({ email: uniqueEmail(), phone: '9845012345', password: 'mango@shop' }).expect(400);
    await passwordLogin({ email: uniqueEmail(), password: '' }).expect(400);
    await ctx.http().post(PWD_SET).send({ password: 'mango@shop' }).expect(401); // needs login
  });
});
