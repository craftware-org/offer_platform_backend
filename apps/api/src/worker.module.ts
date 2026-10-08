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
import { EmailModule } from './infrastructure/email/email.module.js';
import { DomainEventsModule } from './infrastructure/events/domain-events.js';
import { RedisModule } from './infrastructure/redis/redis.module.js';
import { StorageModule } from './infrastructure/storage/storage.module.js';
import { NOTIFICATIONS_QUEUE, NotificationsProcessor, NotificationsScheduler } from './jobs/notifications.job.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';

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
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
    // Notifications (ADR-0016): the worker announces offer.went_live and sends the email outbox.
    DomainEventsModule,
    RedisModule,
    EmailModule,
    StorageModule,
    OfferLifecycleModule,
    NotificationsModule,
  ],
  providers: [OfferLifecycleProcessor, OfferLifecycleScheduler, NotificationsProcessor, NotificationsScheduler],
})
export class WorkerModule {}
