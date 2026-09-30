import { Body, Controller, Get, Header, Param, Patch, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal, RequestId, RequirePermissions } from '../../common/auth/decorators.js';
import type { Principal } from '../../common/auth/principal.js';
import { AppError } from '../../common/errors/app-error.js';
import { pageQuerySchema } from '../../common/http/pagination.js';
import { Permission } from '../access-control/access-control.catalog.js';
import { businessStatusActionSchema, updateBusinessSchema } from './business.dto.js';
import { BusinessImagesService } from './business-images.service.js';
import { BusinessModerationService } from './business-moderation.service.js';
import { businessStatus } from './businesses.schema.js';

const idParam = z.uuid();
const variantParam = z.enum(['full', 'thumb']);
const listQuery = pageQuerySchema.extend({
  status: z.enum(businessStatus.enumValues).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  cityId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
});

@ApiTags('Admin · Businesses')
@ApiBearerAuth()
@Controller('admin/businesses')
export class BusinessesAdminController {
  constructor(
    private readonly moderation: BusinessModerationService,
    private readonly images: BusinessImagesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List/search businesses. status=UNDER_REVIEW is the verification queue (oldest first).',
  })
  @RequirePermissions(Permission.BUSINESSES_READ)
  list(@Query({ schema: listQuery }) query: z.infer<typeof listQuery>) {
    return this.moderation.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Full business details, including private verification photos' })
  @RequirePermissions(Permission.BUSINESSES_READ)
  get(@Param('id', { schema: idParam }) id: string) {
    return this.moderation.get(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'VERIFY / REJECT (businesses:verify) or SUSPEND / REACTIVATE (businesses:manage). Reason required to reject/suspend.',
  })
  @RequirePermissions(Permission.BUSINESSES_READ)
  changeStatus(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: businessStatusActionSchema }) body: z.infer<typeof businessStatusActionSchema>,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    const needed =
      body.action === 'VERIFY' || body.action === 'REJECT'
        ? Permission.BUSINESSES_VERIFY
        : Permission.BUSINESSES_MANAGE;
    if (!principal.permissions.has(needed)) throw AppError.forbidden();
    return this.moderation.changeStatus(id, body.action, body.reason, {
      userId: principal.userId,
      requestId,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit any detail, including fields locked for the owner (audited)' })
  @RequirePermissions(Permission.BUSINESSES_MANAGE)
  update(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateBusinessSchema }) body: z.infer<typeof updateBusinessSchema>,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.moderation.update(id, body, { userId: principal.userId, requestId });
  }

  @Get(':id/images/:imageId/:variant')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(Permission.BUSINESSES_READ)
  async image(
    @Param('id', { schema: idParam }) id: string,
    @Param('imageId', { schema: idParam }) imageId: string,
    @Param('variant', { schema: variantParam }) variant: z.infer<typeof variantParam>,
  ) {
    const content = await this.images.readForAdmin(id, imageId, variant);
    return new StreamableFile(content.body, { type: content.contentType });
  }
}
