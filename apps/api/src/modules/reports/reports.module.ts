import { Body, Controller, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal, RequestId, RequirePermissions } from '../../common/auth/decorators.js';
import type { Principal } from '../../common/auth/principal.js';
import { AppError } from '../../common/errors/app-error.js';
import { pageQuerySchema } from '../../common/http/pagination.js';
import { Permission } from '../access-control/access-control.catalog.js';
import { AuditModule } from '../audit/audit.module.js';
import { BusinessesModule } from '../businesses/businesses.module.js';
import { OffersModule } from '../offers/offers.module.js';
import { UsersModule } from '../users/users.module.js';
import { reportActionType, reportReason, reportStatus } from './reports.schema.js';
import { ReportsService } from './reports.service.js';

const idParam = z.uuid();
const createSchema = z.strictObject({
  offerId: z.uuid(),
  reason: z.enum(reportReason.enumValues),
  note: z.string().trim().max(1000).optional(),
});
const listQuery = pageQuerySchema.extend({ status: z.enum(reportStatus.enumValues).optional() });
const actSchema = z.strictObject({
  action: z.enum(reportActionType.enumValues),
  note: z.string().trim().max(1000).optional(),
});

@ApiTags('Reports')
@ApiBearerAuth()
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post('reports')
  @ApiOperation({ summary: 'Report an offer (logged-in users; one open report per person per offer)' })
  create(@Body({ schema: createSchema }) body: z.infer<typeof createSchema>, @CurrentPrincipal() p: Principal) {
    return this.reports.create(p.userId, body.offerId, { reason: body.reason, note: body.note });
  }

  @Get('me/businesses/:id/warnings')
  @ApiOperation({ summary: 'Warnings from the platform about this business (last 180 days)' })
  warnings(@Param('id', { schema: idParam }) id: string, @CurrentPrincipal() p: Principal) {
    return this.reports.warningsForBusiness(p.userId, id);
  }
}

@ApiTags('Admin · Reports')
@ApiBearerAuth()
@Controller('admin/reports')
export class ReportsAdminController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @ApiOperation({ summary: 'Reports; status=OPEN is the queue (oldest first)' })
  @RequirePermissions(Permission.REPORTS_MODERATE)
  list(@Query({ schema: listQuery }) query: z.infer<typeof listQuery>) {
    return this.reports.list(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.REPORTS_MODERATE)
  get(@Param('id', { schema: idParam }) id: string) {
    return this.reports.get(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'DISMISS, WARN_BUSINESS (note = message to the business), SUSPEND_OFFER (also offers:moderate) or SUSPEND_BUSINESS (also businesses:manage). A note is required except to dismiss.',
  })
  @RequirePermissions(Permission.REPORTS_MODERATE)
  act(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: actSchema }) body: z.infer<typeof actSchema>,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    const extra =
      body.action === 'SUSPEND_OFFER'
        ? Permission.OFFERS_MODERATE
        : body.action === 'SUSPEND_BUSINESS'
          ? Permission.BUSINESSES_MANAGE
          : null;
    if (extra && !principal.permissions.has(extra)) throw AppError.forbidden();
    return this.reports.act(id, body.action, body.note, { userId: principal.userId, requestId });
  }
}

/** Phase 5 reports: customers report offers, admins act on them (spec §21, §27). */
@Module({
  imports: [AuditModule, UsersModule, OffersModule, BusinessesModule],
  controllers: [ReportsController, ReportsAdminController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
