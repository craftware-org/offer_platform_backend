import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { APP_CONFIG, ConfigModule, type AppConfig } from './config/config.module.js';
import { loggerParams } from './config/logger.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { bullConnectionOptions } from './infrastructure/redis/connection-options.js';
import {
  OFFER_LIFECYCLE_QUEUE,
  OfferLifecycleProcessor,
  OfferLifecycleScheduler,
} from './jobs/offer-lifecycle.job.js';
import { OfferLifecycleModule } from './modules/offers/offers.module.js';

/** The background worker process: scheduled and queued jobs only, no HTTP (ADR-0002, ADR-0007). */
@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => loggerParams(config),
    }),
    DatabaseModule,
    BullModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        connection: bullConnectionOptions(config.REDIS_URL),
        prefix: 'offer-platform',
      }),
    }),
    BullModule.registerQueue({ name: OFFER_LIFECYCLE_QUEUE }),
    OfferLifecycleModule,
  ],
  providers: [OfferLifecycleProcessor, OfferLifecycleScheduler],
})
export class WorkerModule {}
