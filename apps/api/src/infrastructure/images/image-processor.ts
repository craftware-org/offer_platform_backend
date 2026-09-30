import { HttpStatus, Injectable } from '@nestjs/common';
import sharp, { type Metadata } from 'sharp';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';

/** Upload limit enforced by the HTTP layer before any decoding happens. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif']);
const MIN_DIMENSION = 200;
/** Refuse decompression bombs: images larger than this many pixels are never decoded. */
const MAX_INPUT_PIXELS = 50_000_000;

export const IMAGE_VARIANTS = {
  full: { maxSize: 1600, quality: 80 },
  thumb: { maxSize: 400, quality: 75 },
} as const;
export type ImageVariant = keyof typeof IMAGE_VARIANTS;

export interface ProcessedImage {
  width: number;
  height: number;
  variants: Record<ImageVariant, Buffer>;
}

const invalidImage = (message: string) =>
  new AppError(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, message, { file: message });

/**
 * Validates an uploaded image by decoding its actual content (never trusting the file name or
 * declared MIME type), then re-encodes it to WebP. Re-encoding drops all metadata, including
 * EXIF GPS coordinates, and neutralises files that only pretend to be images.
 */
@Injectable()
export class ImageProcessor {
  async process(input: Buffer): Promise<ProcessedImage> {
    let meta: Metadata;
    try {
      meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    } catch {
      throw invalidImage('The file is not a valid image');
    }
    if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) {
      throw invalidImage('Only JPEG, PNG, WebP or AVIF images are accepted');
    }
    if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < MIN_DIMENSION) {
      throw invalidImage(`The image must be at least ${MIN_DIMENSION}×${MIN_DIMENSION} pixels`);
    }

    try {
      const entries = await Promise.all(
        (Object.keys(IMAGE_VARIANTS) as ImageVariant[]).map(async (variant) => {
          const { maxSize, quality } = IMAGE_VARIANTS[variant];
          const buffer = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
            .rotate() // apply EXIF orientation before the metadata is dropped
            .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
            .webp({ quality })
            .toBuffer();
          return [variant, buffer] as const;
        }),
      );
      const variants = Object.fromEntries(entries) as Record<ImageVariant, Buffer>;
      const full = await sharp(variants.full).metadata();
      return { width: full.width ?? meta.width, height: full.height ?? meta.height, variants };
    } catch {
      throw invalidImage('The image could not be processed');
    }
  }
}
