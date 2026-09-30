import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig } from '../../config/config.module.js';
import { LocalDiskStorageProvider } from './storage.module.js';

describe('LocalDiskStorageProvider', () => {
  let root: string;
  let storage: LocalDiskStorageProvider;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'storage-test-'));
    storage = new LocalDiskStorageProvider({ STORAGE_LOCAL_DIR: root } as AppConfig);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stores, reads and deletes by prefix', async () => {
    await storage.put('businesses/b1/img1/full.webp', Buffer.from('a'), 'image/webp');
    await storage.put('businesses/b1/img1/thumb.webp', Buffer.from('b'), 'image/webp');
    expect((await storage.get('businesses/b1/img1/full.webp'))?.toString()).toBe('a');

    await storage.deletePrefix('businesses/b1/img1');
    expect(await storage.get('businesses/b1/img1/full.webp')).toBeNull();
  });

  it('returns null for missing objects', async () => {
    expect(await storage.get('businesses/none/x.webp')).toBeNull();
  });

  it.each(['../etc/passwd', 'a/../../b', '/abs/path', 'UPPER/case', 'a//b', ''])(
    'refuses unsafe key %j',
    async (key) => {
      await expect(storage.get(key)).rejects.toThrow(/Unsafe|escapes/);
    },
  );
});
