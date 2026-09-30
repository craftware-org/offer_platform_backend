import { Module } from '@nestjs/common';
import { AuditAdminController } from './audit.admin.controller.js';
import { AuditService } from './audit.service.js';

@Module({
  controllers: [AuditAdminController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
