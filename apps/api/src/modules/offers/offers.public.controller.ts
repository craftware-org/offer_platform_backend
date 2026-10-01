import { Controller, Get, Header, Param, Query, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../../common/auth/decorators.js';
import { pageQuerySchema } from '../../common/http/pagination.js';
import { OfferImagesService } from './offer-images.service.js';
import { OffersPublicService } from './offers-public.service.js';

const slugParam = z.string().min(1).max(100);
const listQuery = pageQuerySchema.extend({
  city: z.string().max(100).optional(),
  locality: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  business: z.string().max(100).optional(),
});

/** Live offers for customers. Search, "near me" and ranking arrive in Phase 4. */
@ApiTags('Offers')
@Public()
@Controller('offers')
export class OffersPublicController {
  constructor(private readonly offers: OffersPublicService) {}

  @Get()
  @ApiOperation({
    summary: 'Live offers (verified businesses), filterable by city/locality/category/business slug',
  })
  list(@Query({ schema: listQuery }) query: z.infer<typeof listQuery>) {
    return this.offers.list(query);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Offer page. Expired offers remain viewable with availability = EXPIRED.' })
  get(@Param('slug', { schema: slugParam }) slug: string) {
    return this.offers.get(slug);
  }
}

const idParam = z.uuid();
const variantParam = z.enum(['full', 'thumb']);

@ApiTags('Media')
@Public()
@Controller('media')
export class OfferMediaController {
  constructor(private readonly images: OfferImagesService) {}

  @Get('offer-images/:imageId/:variant')
  @Header('Cache-Control', 'public, max-age=86400')
  // Public images are embedded by the website and apps on other origins; helmet's default
  // (same-origin) would make browsers refuse them. Private images keep the strict default.
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  async image(
    @Param('imageId', { schema: idParam }) imageId: string,
    @Param('variant', { schema: variantParam }) variant: z.infer<typeof variantParam>,
  ) {
    const content = await this.images.readPublic(imageId, variant);
    return new StreamableFile(content.body, { type: content.contentType });
  }
}
