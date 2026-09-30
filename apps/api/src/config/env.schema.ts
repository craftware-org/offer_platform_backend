import { z } from 'zod';

const secret = (name: string) => z.string().min(32, `${name} must be at least 32 characters`);

/**
 * Every environment variable the API reads. Validated once at startup:
 * a missing or invalid value stops the process instead of failing later.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    /** Number of reverse proxies (e.g. AWS ALB) in front of the app, used to read the client IP. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),

    APP_DISPLAY_NAME: z.string().min(1).default('Offer Platform'),
    APP_PUBLIC_URL: z.url().default('https://offer-platform.example'),

    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),

    JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(180).default(30),

    /** HMAC key for hashing OTP codes at rest. */
    OTP_HASH_SECRET: secret('OTP_HASH_SECRET'),
    OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
    OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(300).default(30),
    OTP_MAX_REQUESTS_PER_PHONE_PER_HOUR: z.coerce.number().int().min(1).default(5),
    OTP_MAX_REQUESTS_PER_IP_PER_HOUR: z.coerce.number().int().min(1).default(20),
    DEFAULT_PHONE_COUNTRY: z.string().length(2).default('IN'),

    /** Only `console` exists until an SMS vendor is chosen (ADR-0006). */
    SMS_PROVIDER: z.enum(['console']).default('console'),

    RATE_LIMIT_PER_IP_PER_MINUTE: z.coerce.number().int().min(1).default(300),

    /** Only `local` (disk) exists until the S3 adapter is built with the AWS setup (Phase 9). */
    STORAGE_PROVIDER: z.enum(['local']).default('local'),
    /** Folder for `local` storage, relative to the API's working directory. */
    STORAGE_LOCAL_DIR: z.string().min(1).default('.storage'),
    UPLOADS_PER_USER_PER_HOUR: z.coerce.number().int().min(1).default(60),

    // Future features: must stay false in the MVP.
    MONETIZATION_ENABLED: z.stringbool().default(false),
    BUSINESS_SUBSCRIPTIONS_ENABLED: z.stringbool().default(false),
    CUSTOMER_SUBSCRIPTIONS_ENABLED: z.stringbool().default(false),
    SPONSORED_OFFERS_ENABLED: z.stringbool().default(false),
    QR_REDEMPTION_ENABLED: z.stringbool().default(false),
    REVIEWS_ENABLED: z.stringbool().default(false),
    REWARDS_ENABLED: z.stringbool().default(false),
    AI_RECOMMENDATIONS_ENABLED: z.stringbool().default(false),
  })
  .superRefine((env, ctx) => {
    const deployed = env.NODE_ENV === 'staging' || env.NODE_ENV === 'production';
    if (deployed && env.SMS_PROVIDER === 'console') {
      ctx.addIssue({
        code: 'custom',
        path: ['SMS_PROVIDER'],
        message: 'The console SMS provider prints OTPs to logs and is not allowed in staging/production',
      });
    }
    if (deployed && env.STORAGE_PROVIDER === 'local') {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_PROVIDER'],
        message:
          'Local disk storage is lost when containers restart and is not allowed in staging/production',
      });
    }
    if (deployed && env.JWT_ACCESS_SECRET === env.OTP_HASH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_HASH_SECRET'],
        message: 'OTP_HASH_SECRET must differ from JWT_ACCESS_SECRET',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
