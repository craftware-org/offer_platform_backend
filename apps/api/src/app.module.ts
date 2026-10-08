import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { ResponseEnvelopeInterceptor } from './common/http/response-envelope.interceptor.js';
import { createValidationPipe } from './common/validation/validation.pipe.js';
import { APP_CONFIG, ConfigModule, type AppConfig } from './config/config.module.js';
import { loggerParams } from './config/logger.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { RedisModule } from './infrastructure/redis/redis.module.js';
import { EmailModule } from './infrastructure/email/email.module.js';
import { SmsModule } from './infrastructure/sms/sms.module.js';
import { StorageModule } from './infrastructure/storage/storage.module.js';
import { AccessControlModule } from './modules/access-control/access-control.module.js';
import { AdminActivityModule } from './modules/admin-activity/admin-activity.module.js';
import { EngagementModule } from './modules/engagement/engagement.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { DomainEventsModule } from './infrastructure/events/domain-events.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BusinessesModule } from './modules/businesses/businesses.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { LocationsModule } from './modules/locations/locations.module.js';
import { DiscoveryModule } from './modules/discovery/discovery.module.js';
import { MetaModule } from './modules/meta/meta.controller.js';
import { OffersModule } from './modules/offers/offers.module.js';
import { PlatformSettingsModule } from './modules/platform-settings/platform-settings.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => loggerParams(config),
    }),
    DatabaseModule,
    RedisModule,
    SmsModule,
    EmailModule,
    StorageModule,
    HealthModule,
    AccessControlModule,
    AuditModule,
    UsersModule,
    AuthModule,
    PlatformSettingsModule,
    LocationsModule,
    CategoriesModule,
    BusinessesModule,
    OffersModule,
    DomainEventsModule,
    EngagementModule,
    NotificationsModule,
    ReportsModule,
    AdminActivityModule,
    DiscoveryModule,
    MetaModule,
  ],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule {}
