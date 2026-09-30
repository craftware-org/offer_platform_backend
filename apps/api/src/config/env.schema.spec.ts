import { parseEnv } from './env.schema.js';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  OTP_HASH_SECRET: 'b'.repeat(32),
};

describe('parseEnv', () => {
  it('applies defaults and keeps every future feature disabled', () => {
    const env = parseEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.OTP_TTL_SECONDS).toBe(300);
    expect(env.MONETIZATION_ENABLED).toBe(false);
    expect(env.SPONSORED_OFFERS_ENABLED).toBe(false);
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it('parses boolean flags and comma-separated origins', () => {
    const env = parseEnv({
      ...base,
      REVIEWS_ENABLED: 'true',
      CORS_ORIGINS: 'http://localhost:5173, https://offer-platform.example',
    });
    expect(env.REVIEWS_ENABLED).toBe(true);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173', 'https://offer-platform.example']);
  });

  it('rejects missing required values', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects short secrets', () => {
    expect(() => parseEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/at least 32/);
  });

  it('refuses the console SMS provider in production', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow(/console SMS provider/);
  });
});
