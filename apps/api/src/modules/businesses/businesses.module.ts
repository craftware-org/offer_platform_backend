import { Module } from '@nestjs/common';
import { ImageProcessor } from '../../infrastructure/images/image-processor.js';
import { AccessControlModule } from '../access-control/access-control.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { LocationsModule } from '../locations/locations.module.js';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module.js';
import { BusinessImagesService } from './business-images.service.js';
import { BusinessModerationService } from './business-moderation.service.js';
import { BusinessReader } from './business-reader.js';
import { BusinessesAdminController } from './businesses.admin.controller.js';
import { BusinessesOwnerController } from './businesses.owner.controller.js';
import { BusinessesPublicController, MediaController } from './businesses.public.controller.js';
import { BusinessesService } from './businesses.service.js';

@Module({
  imports: [AccessControlModule, AuditModule, CategoriesModule, LocationsModule, PlatformSettingsModule],
  controllers: [
    BusinessesOwnerController,
    BusinessesPublicController,
    BusinessesAdminController,
    MediaController,
  ],
  providers: [
    BusinessReader,
    BusinessesService,
    BusinessModerationService,
    BusinessImagesService,
    ImageProcessor,
  ],
  exports: [BusinessesService, BusinessReader],
})
export class BusinessesModule {}
