import { Controller, Get, Module, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermissions } from '../../common/auth/decorators.js';
import type { Principal } from '../../common/auth/principal.js';
import { Permission } from '../access-control/access-control.catalog.js';
import { BusinessesModule } from '../businesses/businesses.module.js';
import { EngagementModule } from '../engagement/engagement.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AnalyticsService } from './analytics.service.js';

const daysSchema = z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)])).default(30);
const businessQuery = z.object({ days: daysSchema });
const adminQuery = z.object({ days: daysSchema, city: z.string().max(100).optional() });

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('me/businesses/:id/insights')
  @ApiOperation({
    summary:
      'Performance of a business you manage for the last 7, 30 or 90 days (days=7|30|90, default 30): totals with ' +
      'the previous period, a daily series, every current offer, and the best offer',
  })
  business(
    @Param('id', { schema: z.uuid() }) id: string,
    @Query({ schema: businessQuery }) q: z.infer<typeof businessQuery>,
    @CurrentPrincipal() p: Principal,
  ) {
    return this.analytics.businessInsights(p.userId, id, q.days);
  }

  @Get('admin/insights')
  @RequirePermissions(Permission.ANALYTICS_READ)
  @ApiOperation({
    summary:
      'Platform dashboard (days=7|30|90): users, businesses, offers, review queues, engagement, top offers and shops, ' +
      'searches (city=<slug> filters the searches)',
  })
  admin(@Query({ schema: adminQuery }) q: z.infer<typeof adminQuery>) {
    return this.analytics.adminInsights(q.days, q.city);
  }
}

/**
 * Phase 7 analytics (spec §30, ADR-0017): daily totals, search logs, business and admin dashboards,
 * the weekly business summary. Loaded by the API and the worker.
 */
@Module({
  imports: [EngagementModule, BusinessesModule, NotificationsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
