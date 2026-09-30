import { Controller, Get, Inject, Module } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/decorators.js';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';
import { DEFAULT_RADIUS_KM, MAX_RADIUS_KM } from '../discovery/ranking.js';

/**
 * Public, non-secret configuration for the web and mobile apps, so the brand name, preview
 * banner and options come from the server instead of being hard-coded in each client.
 */
@ApiTags('Meta')
@Public()
@Controller('meta')
export class MetaController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get()
  @ApiOperation({ summary: 'App name, preview status, login methods, discovery options, feature flags' })
  get() {
    const c = this.config;
    return {
      appName: c.APP_DISPLAY_NAME,
      publicUrl: c.APP_PUBLIC_URL,
      /** Team-only preview server: show a banner; login codes are not delivered by SMS. */
      preview: c.PREVIEW_MODE,
      loginMethods: {
        phone: { available: true, delivery: c.SMS_PROVIDER === 'console' ? 'server-log' : 'sms' },
        email: { available: true, delivery: c.EMAIL_PROVIDER === 'console' ? 'server-log' : 'email' },
      },
      discovery: {
        defaultRadiusKm: DEFAULT_RADIUS_KM,
        maxRadiusKm: MAX_RADIUS_KM,
        radiusOptionsKm: [2, 5, 10, 25],
      },
      features: {
        monetization: c.MONETIZATION_ENABLED,
        sponsoredOffers: c.SPONSORED_OFFERS_ENABLED,
        qrRedemption: c.QR_REDEMPTION_ENABLED,
        reviews: c.REVIEWS_ENABLED,
        rewards: c.REWARDS_ENABLED,
        aiRecommendations: c.AI_RECOMMENDATIONS_ENABLED,
      },
    };
  }
}

@Module({ controllers: [MetaController] })
export class MetaModule {}
