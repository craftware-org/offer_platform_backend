import { randomInt } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Redis } from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { APP_OPTIONS, configureApp } from '../../src/app.setup.js';
import { DB, type Database } from '../../src/infrastructure/database/database.module.js';
import { REDIS } from '../../src/infrastructure/redis/redis.token.js';
import { SmsProvider } from '../../src/infrastructure/sms/sms.module.js';
import { AccessControlService } from '../../src/modules/access-control/access-control.service.js';

/** Captures outgoing SMS so tests can read the OTP, exactly as a user would from their phone. */
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
  close: () => Promise<void>;
}

/** Boots the real application (same modules, guards, pipes, filters) against the test containers. */
export async function createTestApp(env: Record<string, string> = {}): Promise<TestContext> {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: inject('databaseUrl'),
    REDIS_URL: inject('redisUrl'),
    JWT_ACCESS_SECRET: 'test-jwt-secret-that-is-long-enough-000000',
    OTP_HASH_SECRET: 'test-otp-secret-that-is-long-enough-111111',
    OTP_MAX_REQUESTS_PER_IP_PER_HOUR: '1000',
    RATE_LIMIT_PER_IP_PER_MINUTE: '10000',
    ...env,
  });

  const sms = new CapturingSmsProvider();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SmsProvider)
    .useValue(sms)
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
    close: () => app.close(),
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
