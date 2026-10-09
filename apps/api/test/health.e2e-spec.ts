import { WORKER_HEARTBEAT_KEY } from '../src/jobs/heartbeat.js';
import { createTestApp, type TestContext } from './helpers/test-app.js';

describe('Health checks used by monitoring — real Postgres + Valkey', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('readiness checks the database and Valkey', async () => {
    const res = await ctx.http().get('/api/v1/health/ready').expect(200);
    expect(res.body.data).toEqual({ status: 'ready', checks: { database: true, redis: true } });
  });

  it('the worker check fails until the worker reports, and again when it goes quiet', async () => {
    await ctx.redis.del(WORKER_HEARTBEAT_KEY);
    const none = await ctx.http().get('/api/v1/health/worker').expect(503);
    expect(none.body.error.message).toBe('Worker has not reported yet');

    await ctx.redis.set(WORKER_HEARTBEAT_KEY, new Date().toISOString());
    const ok = await ctx.http().get('/api/v1/health/worker').expect(200);
    expect(ok.body.data.status).toBe('ok');

    await ctx.redis.set(WORKER_HEARTBEAT_KEY, new Date(Date.now() - 10 * 60_000).toISOString());
    const stale = await ctx.http().get('/api/v1/health/worker').expect(503);
    expect(stale.body.error.message).toMatch(/^Worker silent for \d+s$/);
  });
});
