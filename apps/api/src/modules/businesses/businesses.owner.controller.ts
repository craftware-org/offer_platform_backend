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
import { MAX_UPLOAD_BYTES } from '../../infrastructure/images/image-processor.js';
import { createBusinessSchema, updateBusinessSchema } from './business.dto.js';
import { BusinessImagesService, type UploadedImageFile } from './business-images.service.js';
import { businessImageKind } from './businesses.schema.js';
import { BusinessesService } from './businesses.service.js';

const idParam = z.uuid();
const variantParam = z.enum(['full', 'thumb']);
const uploadQuery = z.strictObject({ kind: z.enum(businessImageKind.enumValues) });

/** Everything a business owner (or staff member) does with their own businesses. */
@ApiTags('Businesses · Owner')
@ApiBearerAuth()
@Controller('me/businesses')
export class BusinessesOwnerController {
  constructor(
    private readonly businesses: BusinessesService,
    private readonly images: BusinessImagesService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Register a business (starts as PENDING, visible only to you)' })
  register(
    @Body({ schema: createBusinessSchema }) body: z.infer<typeof createBusinessSchema>,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.businesses.register(body, { userId: principal.userId, requestId });
  }

  @Get()
  @ApiOperation({ summary: 'Businesses you own or manage' })
  list(@CurrentPrincipal() principal: Principal) {
    return this.businesses.listManaged(principal.userId);
  }

  @Get(':id')
  get(@Param('id', { schema: idParam }) id: string, @CurrentPrincipal() principal: Principal) {
    return this.businesses.getManaged(principal.userId, id);
  }

  @Get(':id/dashboard')
  @ApiOperation({ summary: 'Verification status, checklist and profile completeness' })
  dashboard(@Param('id', { schema: idParam }) id: string, @CurrentPrincipal() principal: Principal) {
    return this.businesses.dashboard(principal.userId, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update details. Name, registration number, phone and location lock once submitted for review.',
  })
  update(
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: updateBusinessSchema }) body: z.infer<typeof updateBusinessSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.businesses.updateManaged(principal.userId, id, body);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit for verification (checklist must be complete)' })
  submit(
    @Param('id', { schema: idParam }) id: string,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.businesses.submitForVerification({ userId: principal.userId, requestId }, id);
  }

  @Post(':id/images')
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
  @ApiOperation({
    summary:
      'Upload one image (multipart field "file"). kind=LOGO|GALLERY are public once verified; ' +
      'VERIFICATION_SHOP|VERIFICATION_OWNER are visible only to you and admins.',
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 } }))
  upload(
    @Param('id', { schema: idParam }) id: string,
    @Query({ schema: uploadQuery }) query: z.infer<typeof uploadQuery>,
    @UploadedFile() file: UploadedImageFile | undefined,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.images.upload(principal.userId, id, query.kind, file);
  }

  @Delete(':id/images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeImage(
    @Param('id', { schema: idParam }) id: string,
    @Param('imageId', { schema: idParam }) imageId: string,
    @CurrentPrincipal() principal: Principal,
  ) {
    await this.images.remove(principal.userId, id, imageId);
  }

  @Get(':id/images/:imageId/:variant')
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
}
