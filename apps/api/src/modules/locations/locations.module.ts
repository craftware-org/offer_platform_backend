import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { LocationsAdminController } from './locations.admin.controller.js';
import { LocationsController } from './locations.controller.js';
import { LocationsService } from './locations.service.js';

@Module({
  imports: [AuditModule],
  controllers: [LocationsController, LocationsAdminController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
