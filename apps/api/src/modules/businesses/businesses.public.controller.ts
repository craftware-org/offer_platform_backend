import { Controller, Get, Header, Param, Query, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../../common/auth/decorators.js';
import { pageQuerySchema } from '../../common/http/pagination.js';
import { BusinessImagesService } from './business-images.service.js';
import { BusinessesService } from './businesses.service.js';

const slugParam = z.string().min(1).max(100);
const listQuery = pageQuerySchema.extend({
  city: z.string().max(100).optional(),
  locality: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
});

/** Public, verified-only business data (search and ranking come in Phase 4). */
@ApiTags('Businesses')
@Public()
@Controller('businesses')
export class BusinessesPublicController {
  constructor(private readonly businesses: BusinessesService) {}

  @Get()
  @ApiOperation({ summary: 'Verified businesses, filterable by city/locality/category slug' })
  list(@Query({ schema: listQuery }) query: z.infer<typeof listQuery>) {
    return this.businesses.listPublic(query);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Public business profile (verified businesses only)' })
  get(@Param('slug', { schema: slugParam }) slug: string) {
    return this.businesses.getPublic(slug);
  }
}

const idParam = z.uuid();
const variantParam = z.enum(['full', 'thumb']);

/** Public images (logos and gallery photos of verified businesses). Image ids are immutable, so cache long. */
@ApiTags('Media')
@Public()
@Controller('media')
export class MediaController {
  constructor(private readonly images: BusinessImagesService) {}

  @Get('images/:imageId/:variant')
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
