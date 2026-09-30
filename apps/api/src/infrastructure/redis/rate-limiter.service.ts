import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AppError } from '../../common/errors/app-error.js';
import { REDIS } from './redis.token.js';

// Atomic fixed-window counter: increment, set the expiry on the first hit, return count and ttl.
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('PTTL', KEYS[1]) }
`;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Distributed rate limiting shared by all API instances (fixed window in Redis). */
@Injectable()
export class RateLimiterService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const [count, ttlMs] = (await this.redis.eval(
      HIT_SCRIPT,
      1,
      `rl:${key}`,
      String(windowSeconds * 1000),
    )) as [number, number];
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
    };
  }

  /** Records a hit and throws RATE_LIMITED when the limit is exceeded. */
  async consume(key: string, limit: number, windowSeconds: number): Promise<void> {
    const result = await this.hit(key, limit, windowSeconds);
    if (!result.allowed) throw AppError.rateLimited(result.retryAfterSeconds);
  }
}
