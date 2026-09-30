import { bullConnectionOptions } from './connection-options.js';

describe('bullConnectionOptions', () => {
  it('parses a local URL', () => {
    expect(bullConnectionOptions('redis://localhost:6379')).toMatchObject({
      host: 'localhost',
      port: 6379,
      db: 0,
      tls: undefined,
      maxRetriesPerRequest: null,
    });
  });

  it('parses credentials, database and TLS (managed Redis/Valkey)', () => {
    expect(bullConnectionOptions('rediss://app:p%40ss@cache.example:6380/2')).toMatchObject({
      host: 'cache.example',
      port: 6380,
      username: 'app',
      password: 'p@ss',
      db: 2,
      tls: {},
    });
  });

  it('rejects other schemes', () => {
    expect(() => bullConnectionOptions('http://localhost:6379')).toThrow(/redis/);
  });
});
