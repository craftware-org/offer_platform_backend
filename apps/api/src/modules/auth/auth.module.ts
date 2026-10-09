import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { BusinessesModule } from '../businesses/businesses.module.js';
import { EngagementModule } from '../engagement/engagement.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OffersModule } from '../offers/offers.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthDataModule } from './auth-data.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard, IpRateLimitGuard, PermissionsGuard } from './guards.js';
import { MfaController } from './mfa.controller.js';
import { MfaService } from './mfa.service.js';
import { OtpService } from './otp.service.js';
import { TokenService } from './token.service.js';

const ISSUER = 'offer-platform-api';
const AUDIENCE = 'offer-platform';

@Module({
  imports: [
    AccessControlModule,
    AuditModule,
    UsersModule,
    AuthDataModule,
    // Account deletion erases data owned by these modules, through their exported services.
    NotificationsModule,
    EngagementModule,
    BusinessesModule,
    OffersModule,
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.JWT_ACCESS_SECRET,
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.JWT_ACCESS_TTL_SECONDS,
          issuer: ISSUER,
          audience: AUDIENCE,
        },
        verifyOptions: { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE },
      }),
    }),
  ],
  controllers: [AuthController, MfaController],
  providers: [
    AuthService,
    OtpService,
    TokenService,
    MfaService,
    // Global guards run in this order for every request: rate limit → authentication → permissions.
    { provide: APP_GUARD, useClass: IpRateLimitGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [MfaService, TokenService],
})
export class AuthModule {}
