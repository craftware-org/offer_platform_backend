import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal, RequestId } from '../../common/auth/decorators.js';
import type { Principal } from '../../common/auth/principal.js';
import { pageQuerySchema } from '../../common/http/pagination.js';
import { MAX_UPLOAD_BYTES } from '../../infrastructure/images/image-processor.js';
import type { UploadedImageFile } from '../businesses/business-images.service.js';
import { createOfferSchema, updateOfferSchema } from './offer.dto.js';
import { OfferImagesService } from './offer-images.service.js';
import { offerStatus } from './offers.schema.js';
import { OffersService, type BusinessOfferAction } from './offers.service.js';

const idParam = z.uuid();
const variantParam = z.enum(['full', 'thumb']);
const listQuery = pageQuerySchema.extend({ status: z.enum(offerStatus.enumValues).optional() });

/** Offers, from the business owner's/staff's side. */
@ApiTags('Offers · Business')
@ApiBearerAuth()
@Controller('me')
export class OffersOwnerController {
  constructor(
    private readonly offers: OffersService,
    private readonly images: OfferImagesService,
  ) {}

  @Post('businesses/:businessId/offers')
  @ApiOperation({ summary: 'Create an offer as DRAFT (any of the 7 offer types, see pricing.type)' })
  create(
    @Param('businessId', { schema: idParam }) businessId: string,
    @Body({ schema: createOfferSchema }) body: z.infer<typeof createOfferSchema>,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.offers.create({ userId: principal.userId, requestId }, businessId, body);
  }

  @Get('businesses/:businessId/offers')
  @ApiOperation({ summary: "A business's offers, optionally by status (DRAFT, ACTIVE, EXPIRED, ...)" })
  list(
    @Param('businessId', { schema: idParam }) businessId: string,
    @Query({ schema: listQuery }) query: z.infer<typeof listQuery>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.offers.listForBusiness(principal.userId, businessId, query);
  }

  @Get('businesses/:businessId/offers/summary')
  @ApiOperation({ summary: 'Number of offers per status (for the business dashboard)' })
  summary(
    @Param('businessId', { schema: idParam }) businessId: string,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.offers.summary(principal.userId, businessId);
  }

  @Get('offers/:id')
  get(@Param('id', { schema: idParam }) id: string, @CurrentPrincipal() principal: Principal) {
    return this.offers.get(principal.userId, id);
  }

  @Patch('offers/:id')
  @ApiOperation({ summary: 'Edit an offer. Editing an approved offer sends it back to admin review.' })
  update(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateOfferSchema }) body: z.infer<typeof updateOfferSchema>,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.offers.update({ userId: principal.userId, requestId }, id, body);
  }

  @Delete('offers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a draft that was never submitted (other offers are kept for history)' })
  async remove(
    @Param('id', { schema: idParam }) id: string,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    await this.offers.deleteDraft({ userId: principal.userId, requestId }, id);
  }

  @Post('offers/:id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit for admin review (automated checks run first)' })
  submit(
    @Param('id', { schema: idParam }) id: string,
    @CurrentPrincipal() p: Principal,
    @RequestId() r?: string,
  ) {
    return this.act(p, id, 'SUBMIT', r);
  }

  @Post('offers/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take an offer back out of review, back to DRAFT' })
  withdraw(
    @Param('id', { schema: idParam }) id: string,
    @CurrentPrincipal() p: Principal,
    @RequestId() r?: string,
  ) {
    return this.act(p, id, 'WITHDRAW', r);
  }

  @Post('offers/:id/pause')
  @HttpCode(HttpStatus.OK)
  pause(
    @Param('id', { schema: idParam }) id: string,
    @CurrentPrincipal() p: Principal,
    @RequestId() r?: string,
  ) {
    return this.act(p, id, 'PAUSE', r);
  }

  @Post('offers/:id/resume')
  @HttpCode(HttpStatus.OK)
  resume(
    @Param('id', { schema: idParam }) id: string,
    @CurrentPrincipal() p: Principal,
    @RequestId() r?: string,
  ) {
    return this.act(p, id, 'RESUME', r);
  }

  @Post('offers/:id/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End the offer now (it becomes EXPIRED and is kept for history)' })
  end(
    @Param('id', { schema: idParam }) id: string,
    @CurrentPrincipal() p: Principal,
    @RequestId() r?: string,
  ) {
    return this.act(p, id, 'END', r);
  }

  @Get('offers/:id/price-history')
  @ApiOperation({ summary: 'Every pricing change of this offer, newest first' })
  priceHistory(@Param('id', { schema: idParam }) id: string, @CurrentPrincipal() principal: Principal) {
    return this.offers.priceHistory(principal.userId, id);
  }

  @Post('offers/:id/images')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'JPEG, PNG, WebP or AVIF, max 8 MB' },
      },
    },
  })
  @ApiOperation({ summary: 'Add a photo (limit is an admin setting, default 5)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 } }))
  upload(
    @Param('id', { schema: idParam }) id: string,
    @UploadedFile() file: UploadedImageFile | undefined,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.images.upload({ userId: principal.userId, requestId }, id, file);
  }

  @Delete('offers/:id/images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeImage(
    @Param('id', { schema: idParam }) id: string,
    @Param('imageId', { schema: idParam }) imageId: string,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    await this.images.remove({ userId: principal.userId, requestId }, id, imageId);
  }

  @Get('offers/:id/images/:imageId/:variant')
  @Header('Cache-Control', 'private, no-store')
  async image(
    @Param('id', { schema: idParam }) id: string,
    @Param('imageId', { schema: idParam }) imageId: string,
    @Param('variant', { schema: variantParam }) variant: z.infer<typeof variantParam>,
    @CurrentPrincipal() principal: Principal,
  ) {
    const content = await this.images.readForMember(principal.userId, id, imageId, variant);
    return new StreamableFile(content.body, { type: content.contentType });
  }

  private act(principal: Principal, id: string, action: BusinessOfferAction, requestId?: string) {
    return this.offers.act({ userId: principal.userId, requestId }, id, action);
  }
}
