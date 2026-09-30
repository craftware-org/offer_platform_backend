import sharp from 'sharp';
import { AppError } from '../../common/errors/app-error.js';
import { ImageProcessor } from './image-processor.js';

const makeJpeg = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#3366ff' } })
    .jpeg()
    .withExif({ IFD0: { Artist: 'someone', Copyright: 'x' } })
    .toBuffer();

describe('ImageProcessor', () => {
  const processor = new ImageProcessor();

  it('re-encodes to WebP variants and strips all metadata', async () => {
    const input = await makeJpeg(2400, 1200);
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const result = await processor.process(input);
    const full = await sharp(result.variants.full).metadata();
    const thumb = await sharp(result.variants.thumb).metadata();

    expect(full.format).toBe('webp');
    expect(full.exif).toBeUndefined();
    expect([full.width, full.height]).toEqual([1600, 800]);
    expect(Math.max(thumb.width ?? 0, thumb.height ?? 0)).toBe(400);
    expect([result.width, result.height]).toEqual([1600, 800]);
  });

  it('never enlarges small images', async () => {
    const result = await processor.process(await makeJpeg(300, 300));
    expect([result.width, result.height]).toEqual([300, 300]);
  });

  it('rejects files that are not images, whatever their name', async () => {
    await expect(processor.process(Buffer.from('<?php system($_GET["c"]); ?>'))).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it('rejects unsupported formats', async () => {
    const gif = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#000' } })
      .gif()
      .toBuffer();
    await expect(processor.process(gif)).rejects.toMatchObject({
      fields: { file: expect.stringContaining('JPEG') },
    });
  });

  it('rejects images that are too small', async () => {
    await expect(processor.process(await makeJpeg(100, 400))).rejects.toMatchObject({
      fields: { file: expect.stringContaining('at least') },
    });
  });
});
