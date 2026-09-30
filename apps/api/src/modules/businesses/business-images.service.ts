import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, eq, inArray } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';
import { DB, type Database } from '../../infrastructure/database/database.module.js';
import { ImageProcessor, type ImageVariant } from '../../infrastructure/images/image-processor.js';
import { RateLimiterService } from '../../infrastructure/redis/rate-limiter.service.js';
import { StorageProvider } from '../../infrastructure/storage/storage.module.js';
import { BusinessReader } from './business-reader.js';
import { canChangeVerificationPhotos } from './business-status.machine.js';
import { toImageView, type ImageView } from './business-views.js';
import {
  businessImages,
  businesses,
  type BusinessImageKind,
  type BusinessImageRow,
  type BusinessStatus,
} from './businesses.schema.js';

/** Maximum images per kind. Single-slot kinds are replaced by a new upload. */
const LIMITS: Record<BusinessImageKind, number> = {
  LOGO: 1,
  GALLERY: 10,
  VERIFICATION_SHOP: 3,
  VERIFICATION_OWNER: 1,
};
const SINGLE_SLOT = new Set<BusinessImageKind>(['LOGO', 'VERIFICATION_OWNER']);
const PUBLIC_KINDS: BusinessImageKind[] = ['LOGO', 'GALLERY'];
const isVerificationKind = (kind: BusinessImageKind) =>
  kind === 'VERIFICATION_SHOP' || kind === 'VERIFICATION_OWNER';

/** Minimal shape of a multer in-memory upload (avoids depending on global Express typings). */
export interface UploadedImageFile {
  buffer: Buffer;
  size: number;
}

export interface ImageContent {
  body: Buffer;
  contentType: 'image/webp';
}

@Injectable()
export class BusinessImagesService {
  private readonly logger = new Logger(BusinessImagesService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly reader: BusinessReader,
    private readonly processor: ImageProcessor,
    private readonly storage: StorageProvider,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async upload(
    userId: string,
    businessId: string,
    kind: BusinessImageKind,
    file: UploadedImageFile | undefined,
  ): Promise<ImageView> {
    if (!file?.buffer?.length) throw AppError.validation({ file: 'An image file is required' });
    await this.rateLimiter.consume(`upload:user:${userId}`, this.config.UPLOADS_PER_USER_PER_HOUR, 3600);

    const business = await this.reader.findManaged(userId, businessId);
    this.assertCanChange(business.status, kind);
    const existing = await this.countOf(businessId, kind);
    if (!SINGLE_SLOT.has(kind) && existing >= LIMITS[kind]) {
      throw AppError.conflict(
        `You can upload up to ${LIMITS[kind]} ${kind.toLowerCase().replace('_', ' ')} photos`,
      );
    }

    // Decode, validate and re-encode BEFORE anything is stored.
    const processed = await this.processor.process(file.buffer);
    const id = uuidv7();
    const storagePrefix = `businesses/${businessId}/${id}`;
    await Promise.all(
      (Object.keys(processed.variants) as ImageVariant[]).map((variant) =>
        this.storage.put(`${storagePrefix}/${variant}.webp`, processed.variants[variant], 'image/webp'),
      ),
    );

    let replaced: BusinessImageRow[] = [];
    let created: BusinessImageRow;
    try {
      created = await this.db.transaction(async (tx) => {
        if (SINGLE_SLOT.has(kind)) {
          replaced = await tx
            .delete(businessImages)
            .where(and(eq(businessImages.businessId, businessId), eq(businessImages.kind, kind)))
            .returning();
        }
        const [row] = await tx
          .insert(businessImages)
          .values({
            id,
            businessId,
            kind,
            storagePrefix,
            width: processed.width,
            height: processed.height,
            bytes: processed.variants.full.length,
            sortOrder: SINGLE_SLOT.has(kind) ? 0 : existing + 1,
            uploadedBy: userId,
          })
          .returning();
        if (!row) throw new Error('Insert returned no row');
        return row;
      });
    } catch (error) {
      await this.storage.deletePrefix(storagePrefix); // never leave orphaned files
      throw error;
    }
    await this.removeFiles(replaced);
    return toImageView('owner', created);
  }

  async remove(userId: string, businessId: string, imageId: string): Promise<void> {
    const business = await this.reader.findManaged(userId, businessId);
    const image = await this.imageOf(businessId, imageId);
    this.assertCanChange(business.status, image.kind);
    await this.db.delete(businessImages).where(eq(businessImages.id, imageId));
    await this.removeFiles([image]);
  }

  /** Public: logo/gallery of a VERIFIED business only. Everything else is "not found". */
  async readPublic(imageId: string, variant: ImageVariant): Promise<ImageContent> {
    const [row] = await this.db
      .select({ image: businessImages })
      .from(businessImages)
      .innerJoin(businesses, eq(businesses.id, businessImages.businessId))
      .where(
        and(
          eq(businessImages.id, imageId),
          inArray(businessImages.kind, PUBLIC_KINDS),
          eq(businesses.status, 'VERIFIED'),
        ),
      );
    if (!row) throw AppError.notFound('Image');
    return this.content(row.image, variant);
  }

  /** Owner/staff: any image of their own business, including verification photos. */
  async readForMember(userId: string, businessId: string, imageId: string, variant: ImageVariant) {
    await this.reader.findManaged(userId, businessId);
    return this.content(await this.imageOf(businessId, imageId), variant);
  }

  /** Admin (businesses:read): any image, including private verification photos. */
  async readForAdmin(businessId: string, imageId: string, variant: ImageVariant) {
    return this.content(await this.imageOf(businessId, imageId), variant);
  }

  private assertCanChange(status: BusinessStatus, kind: BusinessImageKind) {
    if (status === 'SUSPENDED') throw AppError.forbidden('This business is suspended');
    if (isVerificationKind(kind) && !canChangeVerificationPhotos(status)) {
      throw new AppError(
        ErrorCode.FIELDS_LOCKED,
        HttpStatus.CONFLICT,
        'Verification photos cannot be changed while under review or after verification',
        { kind: 'Locked' },
      );
    }
  }

  private async countOf(businessId: string, kind: BusinessImageKind): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(businessImages)
      .where(and(eq(businessImages.businessId, businessId), eq(businessImages.kind, kind)));
    return row?.value ?? 0;
  }

  private async imageOf(businessId: string, imageId: string): Promise<BusinessImageRow> {
    const [image] = await this.db
      .select()
      .from(businessImages)
      .where(and(eq(businessImages.id, imageId), eq(businessImages.businessId, businessId)));
    if (!image) throw AppError.notFound('Image');
    return image;
  }

  private async content(image: BusinessImageRow, variant: ImageVariant): Promise<ImageContent> {
    const body = await this.storage.get(`${image.storagePrefix}/${variant}.webp`);
    if (!body) {
      this.logger.error({ imageId: image.id, variant }, 'Image file missing from storage');
      throw AppError.notFound('Image');
    }
    return { body, contentType: 'image/webp' };
  }

  /** Best effort: a failure leaves an orphaned file (logged), never a broken record. */
  private async removeFiles(images: BusinessImageRow[]): Promise<void> {
    for (const image of images) {
      try {
        await this.storage.deletePrefix(image.storagePrefix);
      } catch (error) {
        this.logger.error({ err: error, imageId: image.id }, 'Failed to delete image files');
      }
    }
  }
}
