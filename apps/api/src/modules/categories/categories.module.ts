import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { CategoriesAdminController, CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';

@Module({
  imports: [AuditModule],
  controllers: [CategoriesController, CategoriesAdminController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
