import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';
import { RateLimiterService } from './rate-limiter.service.js';
import { REDIS } from './redis.token.js';

export { REDIS };

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [APP_CONFIG],
      // lazyConnect: connect on first command, so building the app (e.g. OpenAPI export) needs no Redis.
      useFactory: (config: AppConfig) => new Redis(config.REDIS_URL, { lazyConnect: true }),
    },
    RateLimiterService,
  ],
  exports: [REDIS, RateLimiterService],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'ready') await this.redis.quit();
    else this.redis.disconnect();
  }
}
