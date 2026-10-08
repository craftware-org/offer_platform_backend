import { Module } from '@nestjs/common';
import { ImageProcessor } from '../../infrastructure/images/image-processor.js';
import { AuditModule } from '../audit/audit.module.js';
import { BusinessesModule } from '../businesses/businesses.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { LocationsModule } from '../locations/locations.module.js';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module.js';
import { OfferImagesService } from './offer-images.service.js';
import { OfferLifecycleService } from './offer-lifecycle.service.js';
import { OfferModerationService } from './offer-moderation.service.js';
import { OfferReader } from './offer-reader.js';
import { OffersAdminController } from './offers.admin.controller.js';
import { OffersOwnerController } from './offers.owner.controller.js';
import { OfferMediaController, OffersPublicController } from './offers.public.controller.js';
import { OffersPublicService } from './offers-public.service.js';
import { OffersService } from './offers.service.js';

@Module({
  imports: [AuditModule, BusinessesModule, CategoriesModule, LocationsModule, PlatformSettingsModule],
  controllers: [OffersOwnerController, OffersAdminController, OffersPublicController, OfferMediaController],
  providers: [
    OfferReader,
    OffersService,
    OfferModerationService,
    OfferImagesService,
    OffersPublicService,
    ImageProcessor,
  ],
  exports: [OfferReader, OffersPublicService, OfferModerationService],
})
export class OffersModule {}

/** Only the time-driven transitions: all the background worker needs (no HTTP, no other modules). */
@Module({ providers: [OfferLifecycleService], exports: [OfferLifecycleService] })
export class OfferLifecycleModule {}
