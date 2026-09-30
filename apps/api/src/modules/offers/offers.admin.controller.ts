import { Body, Controller, Get, Header, Param, Patch, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal, RequestId, RequirePermissions } from '../../common/auth/decorators.js';
import type { Principal } from '../../common/auth/principal.js';
import { pageQuerySchema } from '../../common/http/pagination.js';
import { Permission } from '../access-control/access-control.catalog.js';
import { offerModerationSchema } from './offer.dto.js';
import { OfferImagesService } from './offer-images.service.js';
import { OfferModerationService } from './offer-moderation.service.js';
import { offerStatus } from './offers.schema.js';
import { OffersService } from './offers.service.js';

const idParam = z.uuid();
const variantParam = z.enum(['full', 'thumb']);
const listQuery = pageQuerySchema.extend({
  status: z.enum(offerStatus.enumValues).optional(),
  businessId: z.uuid().optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

@ApiTags('Admin · Offers')
@ApiBearerAuth()
@Controller('admin/offers')
export class OffersAdminController {
  constructor(
    private readonly moderation: OfferModerationService,
    private readonly offers: OffersService,
    private readonly images: OfferImagesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List/search offers. status=PENDING_REVIEW is the review queue (oldest first).' })
  @RequirePermissions(Permission.OFFERS_READ)
  list(@Query({ schema: listQuery }) query: z.infer<typeof listQuery>) {
    return this.moderation.list(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.OFFERS_READ)
  get(@Param('id', { schema: idParam }) id: string) {
    return this.moderation.get(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'APPROVE, REJECT, REQUEST_CHANGES, SUSPEND or REACTIVATE. A reason is required except for approve/reactivate.',
  })
  @RequirePermissions(Permission.OFFERS_MODERATE)
  moderate(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: offerModerationSchema }) body: z.infer<typeof offerModerationSchema>,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.moderation.moderate(id, body, { userId: principal.userId, requestId });
  }

  @Get(':id/price-history')
  @RequirePermissions(Permission.OFFERS_READ)
  priceHistory(@Param('id', { schema: idParam }) id: string) {
    return this.offers.priceHistoryOf(id);
  }

  @Get(':id/images/:imageId/:variant')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(Permission.OFFERS_READ)
  async image(
    @Param('id', { schema: idParam }) id: string,
    @Param('imageId', { schema: idParam }) imageId: string,
    @Param('variant', { schema: variantParam }) variant: z.infer<typeof variantParam>,
  ) {
    const content = await this.images.readForAdmin(id, imageId, variant);
    return new StreamableFile(content.body, { type: content.contentType });
  }
}
