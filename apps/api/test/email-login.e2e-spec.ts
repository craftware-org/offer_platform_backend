import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { auditLogs } from '../src/modules/audit/audit.schema.js';
import { bearer, createTestApp, login, type TestContext } from './helpers/test-app.js';

const OTP_REQUEST = '/api/v1/auth/otp/request';
const OTP_VERIFY = '/api/v1/auth/otp/verify';
const uniqueEmail = () => `user.${randomBytes(4).toString('hex')}@example.com`;

describe('Email login + preview meta (real Postgres + Valkey)', () => {
  let ctx: TestContext;

  const emailLogin = async (address: string, typed = address) => {
    await ctx.http().post(OTP_REQUEST).send({ email: typed }).expect(202);
    const res = await ctx
      .http()
      .post(OTP_VERIFY)
      .send({ email: typed, code: ctx.email.lastCodeFor(address) })
      .expect(200);
    return res.body.data as {
      accessToken: string;
      isNewUser: boolean;
      user: { id: string; email: string; emailVerified: boolean };
    };
  };

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('sends a code by email and creates a verified account on first login', async () => {
    const address = uniqueEmail();
    const first = await emailLogin(address, address.toUpperCase()); // addresses are case-insensitive
    expect(first).toMatchObject({ isNewUser: true, user: { email: address, emailVerified: true } });

    const message = ctx.email.sent.at(-1)!;
    expect(message.subject).toMatch(/^\d{6} is your .+ login code$/);
    expect(message.text).toContain('expires in 5 minutes');
    expect(message.html).toContain('Never share it');

    await ctx.redis.del(`rl:otp:cooldown:${address}`);
    const again = await emailLogin(address);
    expect(again).toMatchObject({ isNewUser: false, user: { id: first.user.id } });

    const me = await ctx.http().get('/api/v1/users/me').set(bearer(again.accessToken)).expect(200);
    expect(me.body.data.roles).toEqual(['CUSTOMER']);
  });

  it('requires exactly one of phone or email', async () => {
    await ctx.http().post(OTP_REQUEST).send({}).expect(400);
    await ctx.http().post(OTP_REQUEST).send({ phone: '9845012345', email: uniqueEmail() }).expect(400);
    await ctx.http().post(OTP_REQUEST).send({ email: 'not-an-email' }).expect(400);
  });

  it('applies the same protections as SMS codes (single use, attempt limit)', async () => {
    const address = uniqueEmail();
    await ctx.http().post(OTP_REQUEST).send({ email: address }).expect(202);
    const code = ctx.email.lastCodeFor(address);
    const wrong = code === '000000' ? '111111' : '000000';
    const bad = await ctx.http().post(OTP_VERIFY).send({ email: address, code: wrong }).expect(400);
    expect(bad.body.error.message).toContain('4 attempts remaining');
    await ctx.http().post(OTP_VERIFY).send({ email: address, code }).expect(200);
    await ctx.http().post(OTP_VERIFY).send({ email: address, code }).expect(400); // already used
  });

  it("an email typed into someone else's profile never logs the real owner into that account", async () => {
    // The attacker logs in by phone and claims the victim's email in their profile (unverified).
    const attacker = await login(ctx);
    const victimEmail = uniqueEmail();
    const claimed = await ctx
      .http()
      .patch('/api/v1/users/me')
      .set(bearer(attacker.accessToken))
      .send({ email: victimEmail })
      .expect(200);
    expect(claimed.body.data).toMatchObject({ email: victimEmail, emailVerified: false });

    // The real owner logs in with a code sent to their inbox: they get THEIR OWN new account.
    const victim = await emailLogin(victimEmail);
    expect(victim.isNewUser).toBe(true);
    expect(victim.user.id).not.toBe(attacker.userId);

    // The unproven claim was removed from the attacker's profile, and that was audited.
    const attackerNow = await ctx
      .http()
      .get('/api/v1/users/me')
      .set(bearer(attacker.accessToken))
      .expect(200);
    expect(attackerNow.body.data.email).toBeNull();
    const audit = await ctx.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, attacker.userId), eq(auditLogs.action, 'UNVERIFIED_EMAIL_RELEASED')));
    expect(audit).toHaveLength(1);
  });

  it('changing the profile email makes it unverified again', async () => {
    const user = await emailLogin(uniqueEmail());
    const changed = await ctx
      .http()
      .patch('/api/v1/users/me')
      .set(bearer(user.accessToken))
      .send({ email: uniqueEmail() })
      .expect(200);
    expect(changed.body.data.emailVerified).toBe(false);
  });

  it('serves public app metadata for the web and mobile apps', async () => {
    const res = await ctx.http().get('/api/v1/meta').expect(200);
    expect(res.body.data).toMatchObject({
      appName: expect.any(String),
      preview: false,
      loginMethods: { phone: { available: true }, email: { available: true } },
      discovery: { defaultRadiusKm: 5, maxRadiusKm: 25, radiusOptionsKm: [2, 5, 10, 25] },
      features: { monetization: false, sponsoredOffers: false },
    });
  });
});
