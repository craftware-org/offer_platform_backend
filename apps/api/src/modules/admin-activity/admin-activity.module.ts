import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { RequirePermissions } from '../../common/auth/decorators.js';
import { pageQuerySchema } from '../../common/http/pagination.js';
import { Permission } from '../access-control/access-control.catalog.js';
import { AuditModule } from '../audit/audit.module.js';
import { BusinessesModule } from '../businesses/businesses.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { LocationsModule } from '../locations/locations.module.js';
import { OffersModule } from '../offers/offers.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminActivityService } from './admin-activity.service.js';

const activityQuery = pageQuerySchema.extend({
  entityType: z.string().max(50).optional(),
  entityId: z.string().max(64).optional(),
  actorUserId: z.uuid().optional(),
  action: z.string().max(100).optional(),
});

@ApiTags('Admin · Audit')
@ApiBearerAuth()
@Controller('admin/activity')
export class AdminActivityController {
  constructor(private readonly activity: AdminActivityService) {}

  @Get()
  @ApiOperation({
    summary: 'Audit trail with names filled in (who did it, which business/offer/user…), newest first',
  })
  @RequirePermissions(Permission.AUDIT_READ)
  list(@Query({ schema: activityQuery }) query: z.infer<typeof activityQuery>) {
    return this.activity.list(query);
  }
}

/** Read-only admin views that combine several modules through their exported services (ADR-0002). */
@Module({
  imports: [AuditModule, UsersModule, BusinessesModule, OffersModule, CategoriesModule, LocationsModule, ReportsModule],
  controllers: [AdminActivityController],
  providers: [AdminActivityService],
})
export class AdminActivityModule {}
