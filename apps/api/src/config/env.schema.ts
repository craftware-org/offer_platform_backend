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

    /** Email login codes: `smtp` (e.g. Gmail with an App Password) or `console` (log only). */
    EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
    /** true = implicit TLS (port 465); false = STARTTLS (port 587). */
    SMTP_SECURE: z.stringbool().default(true),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    /** Sender shown to users, e.g. "Dodoom <craftwaretech@gmail.com>". */
    EMAIL_FROM: z.string().min(3).optional(),

    /**
     * Team-only preview deployment (ADR-0013): allows console SMS/email and local storage on a
     * `staging` server. Never allowed in production.
     */
    PREVIEW_MODE: z.stringbool().default(false),

    RATE_LIMIT_PER_IP_PER_MINUTE: z.coerce.number().int().min(1).default(300),

    /** Only `local` (disk) exists until the S3 adapter is built with the AWS setup (Phase 9). */
    STORAGE_PROVIDER: z.enum(['local']).default('local'),
    /** Folder for `local` storage, relative to the API's working directory. */
    STORAGE_LOCAL_DIR: z.string().min(1).default('.storage'),
    UPLOADS_PER_USER_PER_HOUR: z.coerce.number().int().min(1).default(60),

    /** How often the worker activates scheduled offers and expires ended ones. */
    OFFER_LIFECYCLE_INTERVAL_MS: z.coerce.number().int().min(1000).max(3_600_000).default(60_000),

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
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });

    if (env.PREVIEW_MODE && env.NODE_ENV === 'production') {
      issue('PREVIEW_MODE', 'Preview mode is never allowed in production');
    }
    // Deployed servers must use real providers, unless this is an explicit team-only preview.
    const strict = deployed && !env.PREVIEW_MODE;
    if (strict && env.SMS_PROVIDER === 'console') {
      issue(
        'SMS_PROVIDER',
        'The console SMS provider prints OTPs to logs; only allowed in development or PREVIEW_MODE',
      );
    }
    if (strict && env.EMAIL_PROVIDER === 'console') {
      issue(
        'EMAIL_PROVIDER',
        'The console email provider prints OTPs to logs; only allowed in development or PREVIEW_MODE',
      );
    }
    if (strict && env.STORAGE_PROVIDER === 'local') {
      issue('STORAGE_PROVIDER', 'Local disk storage is only allowed in development or PREVIEW_MODE');
    }
    if (env.EMAIL_PROVIDER === 'smtp') {
      for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM'] as const) {
        if (!env[key]) issue(key, `${key} is required when EMAIL_PROVIDER=smtp`);
      }
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
