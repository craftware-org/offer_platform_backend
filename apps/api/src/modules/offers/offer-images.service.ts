import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, eq, inArray } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { AppError } from '../../common/errors/app-error.js';
import { API_BASE_PATH } from '../../common/http/api-prefix.js';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';
import { DB, type Database } from '../../infrastructure/database/database.module.js';
import { ImageProcessor, type ImageVariant } from '../../infrastructure/images/image-processor.js';
import { RateLimiterService } from '../../infrastructure/redis/rate-limiter.service.js';
import { StorageProvider } from '../../infrastructure/storage/storage.module.js';
import { businesses } from '../businesses/businesses.schema.js';
import type { UploadedImageFile } from '../businesses/business-images.service.js';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service.js';
import { OfferReader } from './offer-reader.js';
import { PUBLIC_STATUSES } from './offer-status.machine.js';
import type { OfferImageView } from './offer-views.js';
import { offerImages, offers, type OfferImageRow } from './offers.schema.js';
import { OffersService } from './offers.service.js';

export interface ImageContent {
  body: Buffer;
  contentType: 'image/webp';
}

/**
 * Offer photos. Same pipeline as business photos (content validation, re-encoding, metadata
 * stripped). Changing the photos of an approved offer sends it back to review.
 */
@Injectable()
export class OfferImagesService {
  private readonly logger = new Logger(OfferImagesService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly reader: OfferReader,
    private readonly offersService: OffersService,
    private readonly settings: PlatformSettingsService,
    private readonly processor: ImageProcessor,
    private readonly storage: StorageProvider,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async upload(actor: { userId: string; requestId?: string }, offerId: string, file?: UploadedImageFile) {
    if (!file?.buffer?.length) throw AppError.validation({ file: 'An image file is required' });
    await this.rateLimiter.consume(
      `upload:user:${actor.userId}`,
      this.config.UPLOADS_PER_USER_PER_HOUR,
      3600,
    );

    const { offer, business } = await this.reader.findManaged(actor.userId, offerId);
    this.offersService.assertEditable(offer, business);
    const { maxImages } = await this.settings.get('offers.limits');
    const existing = await this.countOf(offerId);
    if (existing >= maxImages) throw AppError.conflict(`An offer can have up to ${maxImages} photos`);

    const processed = await this.processor.process(file.buffer);
    const id = uuidv7();
    const storagePrefix = `offers/${offerId}/${id}`;
    await Promise.all(
      (Object.keys(processed.variants) as ImageVariant[]).map((v) =>
        this.storage.put(`${storagePrefix}/${v}.webp`, processed.variants[v], 'image/webp'),
      ),
    );

    try {
      const row = await this.db.transaction(async (tx) => {
        // Re-check under lock: the offer may have changed while the image was processed.
        const locked = await this.reader.findManaged(actor.userId, offerId, tx, true);
        this.offersService.assertEditable(locked.offer, locked.business);
        const [created] = await tx
          .insert(offerImages)
          .values({
            id,
            offerId,
            storagePrefix,
            width: processed.width,
            height: processed.height,
            bytes: processed.variants.full.length,
            sortOrder: existing + 1,
            uploadedBy: actor.userId,
          })
          .returning();
        if (!created) throw new Error('Insert returned no row');
        await this.offersService.sendBackToReviewIfLive(tx, locked.offer, locked.business, actor, ['images']);
        return created;
      });
      return this.ownerView(row);
    } catch (error) {
      await this.storage.deletePrefix(storagePrefix);
      throw error;
    }
  }

  async remove(
    actor: { userId: string; requestId?: string },
    offerId: string,
    imageId: string,
  ): Promise<void> {
    const image = await this.db.transaction(async (tx) => {
      const { offer, business } = await this.reader.findManaged(actor.userId, offerId, tx, true);
      this.offersService.assertEditable(offer, business);
      const [deleted] = await tx
        .delete(offerImages)
        .where(and(eq(offerImages.id, imageId), eq(offerImages.offerId, offerId)))
        .returning();
      if (!deleted) throw AppError.notFound('Image');
      await this.offersService.sendBackToReviewIfLive(tx, offer, business, actor, ['images']);
      return deleted;
    });
    await this.storage
      .deletePrefix(image.storagePrefix)
      .catch((err: unknown) => this.logger.error({ err, imageId }, 'Image cleanup failed'));
  }

  /** Public: photos of an offer customers can see (active/paused/expired, verified business). */
  async readPublic(imageId: string, variant: ImageVariant): Promise<ImageContent> {
    const [row] = await this.db
      .select({ image: offerImages })
      .from(offerImages)
      .innerJoin(offers, eq(offers.id, offerImages.offerId))
      .innerJoin(businesses, eq(businesses.id, offers.businessId))
      .where(
        and(
          eq(offerImages.id, imageId),
          inArray(offers.status, [...PUBLIC_STATUSES]),
          eq(businesses.status, 'VERIFIED'),
        ),
      );
    if (!row) throw AppError.notFound('Image');
    return this.content(row.image, variant);
  }

  async readForMember(userId: string, offerId: string, imageId: string, variant: ImageVariant) {
    await this.reader.findManaged(userId, offerId);
    return this.content(await this.imageOf(offerId, imageId), variant);
  }

  async readForAdmin(offerId: string, imageId: string, variant: ImageVariant) {
    return this.content(await this.imageOf(offerId, imageId), variant);
  }

  private ownerView(row: OfferImageRow): OfferImageView {
    const base = `${API_BASE_PATH}/me/offers/${row.offerId}/images/${row.id}`;
    return {
      id: row.id,
      width: row.width,
      height: row.height,
      urls: { full: `${base}/full`, thumb: `${base}/thumb` },
    };
  }

  private async countOf(offerId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(offerImages)
      .where(eq(offerImages.offerId, offerId));
    return row?.value ?? 0;
  }

  private async imageOf(offerId: string, imageId: string): Promise<OfferImageRow> {
    const [image] = await this.db
      .select()
      .from(offerImages)
      .where(and(eq(offerImages.id, imageId), eq(offerImages.offerId, offerId)));
    if (!image) throw AppError.notFound('Image');
    return image;
  }

  private async content(image: OfferImageRow, variant: ImageVariant): Promise<ImageContent> {
    const body = await this.storage.get(`${image.storagePrefix}/${variant}.webp`);
    if (!body) {
      this.logger.error({ imageId: image.id, variant }, 'Image file missing from storage');
      throw AppError.notFound('Image');
    }
    return { body, contentType: 'image/webp' };
  }
}
