import { Controller, Get, HttpStatus, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { Public } from '../../common/auth/decorators.js';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { DB, type Database } from '../../infrastructure/database/database.module.js';
import { REDIS } from '../../infrastructure/redis/redis.token.js';
import { WORKER_HEARTBEAT_KEY } from '../../jobs/heartbeat.js';

/** The worker beats every minute; three missed beats means it is down or stuck. */
const WORKER_STALE_SECONDS = 180;

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);

@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness: the process is running' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: database and Redis are reachable' })
  async ready() {
    const [database, redis] = await Promise.allSettled([
      withTimeout(this.db.execute(sql`select 1`), 2000),
      withTimeout(this.redis.ping(), 2000),
    ]);
    const checks = { database: database.status === 'fulfilled', redis: redis.status === 'fulfilled' };
    if (!checks.database || !checks.redis) {
      throw new AppError(
        ErrorCode.SERVICE_UNAVAILABLE,
        HttpStatus.SERVICE_UNAVAILABLE,
        `Not ready: ${Object.entries(checks)
          .filter(([, ok]) => !ok)
          .map(([name]) => name)
          .join(', ')}`,
      );
    }
    return { status: 'ready', checks };
  }

  @Get('worker')
  @ApiOperation({
    summary: 'Background worker: alive if it reported in the last 3 minutes (used by monitoring)',
  })
  async worker() {
    const last = await withTimeout(this.redis.get(WORKER_HEARTBEAT_KEY), 2000).catch(() => null);
    const ageSeconds = last ? Math.round((Date.now() - Date.parse(last)) / 1000) : null;
    if (ageSeconds === null || ageSeconds > WORKER_STALE_SECONDS) {
      throw new AppError(
        ErrorCode.SERVICE_UNAVAILABLE,
        HttpStatus.SERVICE_UNAVAILABLE,
        ageSeconds === null ? 'Worker has not reported yet' : `Worker silent for ${ageSeconds}s`,
      );
    }
    return { status: 'ok', lastSeenSecondsAgo: ageSeconds };
  }
}
