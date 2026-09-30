import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { PlatformSettingsAdminController } from './platform-settings.admin.controller.js';
import { PlatformSettingsService } from './platform-settings.service.js';

@Module({
  imports: [AuditModule],
  controllers: [PlatformSettingsAdminController],
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
