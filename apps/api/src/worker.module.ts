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
import { ANALYTICS_QUEUE, AnalyticsProcessor, AnalyticsScheduler } from './jobs/analytics.job.js';
import {
  NOTIFICATIONS_QUEUE,
  NotificationsProcessor,
  NotificationsScheduler,
} from './jobs/notifications.job.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { WorkerHeartbeat } from './jobs/heartbeat.js';
import {
  MAINTENANCE_QUEUE,
  MaintenanceProcessor,
  MaintenanceScheduler,
  RetentionService,
} from './jobs/retention.job.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthDataModule } from './modules/auth/auth-data.module.js';
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
    BullModule.registerQueue({ name: ANALYTICS_QUEUE }),
    BullModule.registerQueue({ name: MAINTENANCE_QUEUE }),
    // Notifications (ADR-0016): the worker announces offer.went_live and sends the email outbox.
    DomainEventsModule,
    RedisModule,
    EmailModule,
    StorageModule,
    OfferLifecycleModule,
    NotificationsModule,
    // Analytics (ADR-0017): nightly daily totals + clean-up, weekly business summary.
    AnalyticsModule,
    // Retention clean-up of personal data (Phase 8).
    AuthDataModule,
    AuditModule,
  ],
  providers: [
    OfferLifecycleProcessor,
    OfferLifecycleScheduler,
    NotificationsProcessor,
    NotificationsScheduler,
    AnalyticsProcessor,
    AnalyticsScheduler,
    RetentionService,
    MaintenanceProcessor,
    MaintenanceScheduler,
    WorkerHeartbeat,
  ],
})
export class WorkerModule {}
