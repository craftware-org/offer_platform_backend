import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
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
      useFactory: (config: AppConfig) => {
        const redis = new Redis(config.REDIS_URL, { lazyConnect: true });
        // Without a listener, ioredis prints "Unhandled error event" on every reconnect attempt.
        // It reconnects by itself; requests that need Redis fail cleanly meanwhile (and /health/ready reports it).
        const logger = new Logger('Redis');
        let lastLogged = 0;
        redis.on('error', (err: Error) => {
          if (Date.now() - lastLogged > 30_000) {
            lastLogged = Date.now();
            logger.error({ err: err.message }, 'Redis connection error (retrying)');
          }
        });
        return redis;
      },
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
