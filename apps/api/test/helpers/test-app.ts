import { randomBytes, randomInt } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { APP_OPTIONS, configureApp } from '../../src/app.setup.js';
import { DB, type Database } from '../../src/infrastructure/database/database.module.js';
import { REDIS } from '../../src/infrastructure/redis/redis.token.js';
import { EmailProvider, type EmailMessage } from '../../src/infrastructure/email/email.module.js';
import { SmsProvider } from '../../src/infrastructure/sms/sms.module.js';
import { withDatabase } from '../global-setup.js';
import { AccessControlService } from '../../src/modules/access-control/access-control.service.js';
import { Role } from '../../src/modules/access-control/access-control.catalog.js';
import { base32Decode, stepAt, totpCode } from '../../src/modules/auth/totp.js';

/** Captures outgoing SMS so tests can read the OTP, exactly as a user would from their phone. */
/** Captures outgoing email so tests can read login codes, like a user reading their inbox. */
export class CapturingEmailProvider extends EmailProvider {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }

  lastCodeFor(to: string): string {
    const last = [...this.sent].reverse().find((m) => m.to === to);
    const code = last?.subject.match(/^(\d+) is your/)?.[1];
    if (!code) throw new Error(`No login code was emailed to ${to}`);
    return code;
  }
}

export class CapturingSmsProvider extends SmsProvider {
  readonly sent: { to: string; message: string }[] = [];

  async send(to: string, message: string): Promise<void> {
    this.sent.push({ to, message });
  }

  lastCodeFor(to: string): string {
    const last = [...this.sent].reverse().find((m) => m.to === to);
    const code = last?.message.match(/^(\d+) is your/)?.[1];
    if (!code) throw new Error(`No OTP was sent to ${to}`);
    return code;
  }
}

const httpClient = (app: NestExpressApplication) => () => request(app.getHttpServer() as App);

export interface TestContext {
  app: NestExpressApplication;
  http: ReturnType<typeof httpClient>;
  db: Database;
  redis: Redis;
  sms: CapturingSmsProvider;
  email: CapturingEmailProvider;
  close: () => Promise<void>;
}

/** Runs one statement against the server's maintenance database. */
async function adminQuery(statement: string): Promise<void> {
  const client = new pg.Client({ connectionString: inject('adminDatabaseUrl') });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

/**
 * Boots the real application (same modules, guards, pipes, filters) against the test containers.
 * Each call gets its OWN database, cloned from the migrated template, so test files never see
 * each other's data.
 */
export async function createTestApp(env: Record<string, string> = {}): Promise<TestContext> {
  const storageDir = await mkdtemp(join(tmpdir(), 'offer-platform-storage-'));
  const database = `test_${randomBytes(6).toString('hex')}`;
  await adminQuery(`CREATE DATABASE ${database} TEMPLATE ${inject('templateDatabase')}`);
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: withDatabase(inject('adminDatabaseUrl'), database),
    REDIS_URL: inject('redisUrl'),
    JWT_ACCESS_SECRET: 'test-jwt-secret-that-is-long-enough-000000',
    OTP_HASH_SECRET: 'test-otp-secret-that-is-long-enough-111111',
    OTP_MAX_REQUESTS_PER_IP_PER_HOUR: '1000',
    RATE_LIMIT_PER_IP_PER_MINUTE: '10000',
    UPLOADS_PER_USER_PER_HOUR: '1000',
    STORAGE_LOCAL_DIR: storageDir,
    ...env,
  });

  const sms = new CapturingSmsProvider();
  const email = new CapturingEmailProvider();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SmsProvider)
    .useValue(sms)
    .overrideProvider(EmailProvider)
    .useValue(email)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS);
  configureApp(app);
  await app.init();

  const db = app.get<Database>(DB);
  await app.get(AccessControlService).syncCatalog();

  return {
    app,
    http: httpClient(app),
    db,
    redis: app.get<Redis>(REDIS),
    sms,
    email,
    close: async () => {
      await app.close();
      await adminQuery(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
      await rm(storageDir, { recursive: true, force: true });
    },
  };
}

const usedPhones = new Set<string>();
/** A unique valid Indian mobile number per call, so tests never share users or rate-limit keys. */
export function uniquePhone(): { input: string; e164: string } {
  let local: string;
  do local = `987${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;
  while (usedPhones.has(local));
  usedPhones.add(local);
  return { input: local, e164: `+91${local}` };
}

export interface LoggedIn {
  userId: string;
  accessToken: string;
  refreshToken: string;
  phone: string;
  /** Set by makeAdmin(): the authenticator secret, to produce codes in tests. */
  totpSecret?: Buffer;
  /** Last authenticator step used (codes can't be reused). */
  totpLastStep?: number;
}

/** Full OTP login through the public API. */
export async function login(ctx: TestContext, phone = uniquePhone()): Promise<LoggedIn> {
  await ctx.http().post('/api/v1/auth/otp/request').send({ phone: phone.input }).expect(202);
  const res = await ctx
    .http()
    .post('/api/v1/auth/otp/verify')
    .send({ phone: phone.input, code: ctx.sms.lastCodeFor(phone.e164) })
    .expect(200);
  return {
    userId: res.body.data.user.id,
    accessToken: res.body.data.accessToken,
    refreshToken: res.body.data.refreshToken,
    phone: phone.e164,
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * A fresh authenticator code for a user set up by makeAdmin(): the current 30-second step, or the
 * next one if the current step was already used (the server accepts one step of clock drift).
 */
export function nextTotp(user: LoggedIn): string {
  if (!user.totpSecret) throw new Error('No authenticator set up for this test user');
  const now = stepAt(new Date());
  const step = Math.max(now, (user.totpLastStep ?? -1) + 1);
  if (step > now + 1) throw new Error('Out of fresh authenticator codes for this 30-second window');
  user.totpLastStep = step;
  return totpCode(user.totpSecret, step);
}

/**
 * Grants an admin role and sets up 2-step login through the real API (admin permissions need a
 * session that passed the authenticator step, ADR-0018). Updates `user`'s tokens in place.
 */
export async function makeAdmin(
  ctx: TestContext,
  user: LoggedIn,
  role: Role = Role.ADMIN,
): Promise<LoggedIn> {
  await ctx.app.get(AccessControlService).grantRole(user.userId, role, null);
  if (!user.totpSecret) {
    const setup = await ctx.http().post('/api/v1/me/mfa/setup').set(bearer(user.accessToken)).expect(200);
    user.totpSecret = base32Decode(setup.body.data.secret);
    const res = await ctx
      .http()
      .post('/api/v1/me/mfa/enable')
      .set(bearer(user.accessToken))
      .send({ code: nextTotp(user) })
      .expect(200);
    user.accessToken = res.body.data.tokens.accessToken;
    user.refreshToken = res.body.data.tokens.refreshToken;
  }
  return user;
}
