import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { ResponseEnvelopeInterceptor } from './common/http/response-envelope.interceptor.js';
import { createValidationPipe } from './common/validation/validation.pipe.js';
import { APP_CONFIG, ConfigModule, type AppConfig } from './config/config.module.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { RedisModule } from './infrastructure/redis/redis.module.js';
import { SmsModule } from './infrastructure/sms/sms.module.js';
import { StorageModule } from './infrastructure/storage/storage.module.js';
import { AccessControlModule } from './modules/access-control/access-control.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BusinessesModule } from './modules/businesses/businesses.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { LocationsModule } from './modules/locations/locations.module.js';
import { PlatformSettingsModule } from './modules/platform-settings/platform-settings.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL,
          // requestIdMiddleware (app.setup.ts) already assigned the id; reuse it.
          genReqId: (req) => (req as { id?: string }).id ?? uuidv7(),
          // Never log credentials or tokens.
          redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
          transport:
            config.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } }
              : undefined,
        },
      }),
    }),
    DatabaseModule,
    RedisModule,
    SmsModule,
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
  ],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule {}
