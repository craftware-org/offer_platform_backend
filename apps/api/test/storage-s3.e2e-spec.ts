import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import type { AppConfig } from '../src/config/config.module.js';
import { S3StorageProvider } from '../src/infrastructure/storage/storage.module.js';

/**
 * The S3 storage provider (Phase 9, ADR-0020) against a real S3-compatible server (Adobe S3Mock),
 * not a mock of the SDK: put/get, missing objects, prefix deletes across pages, unsafe keys.
 */
const S3MOCK_IMAGE = 'adobe/s3mock:5.2.3';
const BUCKET = 'offer-platform-test';

describe('S3 storage provider (real S3-compatible server)', () => {
  let container: StartedTestContainer;
  let storage: S3StorageProvider;

  beforeAll(async () => {
    container = await new GenericContainer(S3MOCK_IMAGE)
      .withEnvironment({ COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS: BUCKET })
      .withExposedPorts(9090)
      .withWaitStrategy(Wait.forHttp('/', 9090).forStatusCode(200))
      .start();
    // S3Mock ignores credentials, but the AWS SDK needs some to sign requests.
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'test';
    storage = new S3StorageProvider({
      S3_BUCKET: BUCKET,
      S3_REGION: 'ap-south-1',
      S3_ENDPOINT: `http://${container.getHost()}:${container.getMappedPort(9090)}`,
      S3_FORCE_PATH_STYLE: true,
    } as AppConfig);
  });
  afterAll(async () => {
    storage?.client.destroy();
    await container?.stop();
  });

  it('stores and reads an object, and returns null for a missing one', async () => {
    const body = Buffer.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3]);
    await storage.put('offers/o1/i1/full.webp', body, 'image/webp');
    expect(await storage.get('offers/o1/i1/full.webp')).toEqual(body);
    expect(await storage.get('offers/o1/i1/missing.webp')).toBeNull();
  });

  it('deletes everything under a prefix, across pages of 1,000, and nothing else', async () => {
    const keys = Array.from({ length: 1003 }, (_, i) => `businesses/b1/img1/part-${i}.webp`);
    for (let i = 0; i < keys.length; i += 50) {
      await Promise.all(keys.slice(i, i + 50).map((k) => storage.put(k, Buffer.from('x'), 'image/webp')));
    }
    await storage.put('businesses/b1/img10/full.webp', Buffer.from('keep'), 'image/webp');

    await storage.deletePrefix('businesses/b1/img1');

    expect(await storage.get(keys[0]!)).toBeNull();
    expect(await storage.get(keys[1002]!)).toBeNull();
    // "img1/" must not match "img10/".
    expect((await storage.get('businesses/b1/img10/full.webp'))?.toString()).toBe('keep');
  });

  it.each(['../etc/passwd', 'a/../../b', '/abs/path', 'UPPER/case', 'a//b', ''])(
    'refuses unsafe key %j',
    async (key) => {
      await expect(storage.get(key)).rejects.toThrow(/Unsafe/);
      await expect(storage.put(key, Buffer.from('x'), 'image/webp')).rejects.toThrow(/Unsafe/);
    },
  );
});
