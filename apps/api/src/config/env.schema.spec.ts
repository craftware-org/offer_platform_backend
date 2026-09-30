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

  describe('preview mode (team-only staging server)', () => {
    it('allows console codes and local storage on staging only when PREVIEW_MODE is set', () => {
      expect(() => parseEnv({ ...base, NODE_ENV: 'staging' })).toThrow(/console SMS provider/);
      const env = parseEnv({ ...base, NODE_ENV: 'staging', PREVIEW_MODE: 'true' });
      expect(env).toMatchObject({ PREVIEW_MODE: true, SMS_PROVIDER: 'console', STORAGE_PROVIDER: 'local' });
    });

    it('is never allowed in production', () => {
      expect(() => parseEnv({ ...base, NODE_ENV: 'production', PREVIEW_MODE: 'true' })).toThrow(
        /never allowed in production/,
      );
    });
  });

  describe('SMTP email', () => {
    const smtp = {
      ...base,
      EMAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_USER: 'craftwaretech@gmail.com',
      SMTP_PASSWORD: 'app-password',
      EMAIL_FROM: 'Dodoom <craftwaretech@gmail.com>',
    };

    it('uses implicit TLS on port 465 by default', () => {
      expect(parseEnv(smtp)).toMatchObject({ SMTP_PORT: 465, SMTP_SECURE: true });
    });

    it('requires host, user, password and sender', () => {
      expect(() => parseEnv({ ...smtp, SMTP_PASSWORD: undefined })).toThrow(/SMTP_PASSWORD is required/);
      expect(() => parseEnv({ ...smtp, EMAIL_FROM: undefined })).toThrow(/EMAIL_FROM is required/);
    });
  });
});
