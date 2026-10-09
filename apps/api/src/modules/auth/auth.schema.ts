import {
  bigint,
  boolean,
  char,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, idColumn, timestamptz } from '../../infrastructure/database/columns.js';
import { users } from '../users/users.schema.js';

export const otpChannel = pgEnum('otp_channel', ['SMS', 'EMAIL']);
export type OtpChannel = (typeof otpChannel.enumValues)[number];

/** One login code sent to a phone (SMS) or an email address. Only an HMAC of the code is stored. */
export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: idColumn(),
    channel: otpChannel('channel').notNull().default('SMS'),
    /** E.164 phone number or lower-case email address. */
    destination: varchar('destination', { length: 254 }).notNull(),
    codeHash: char('code_hash', { length: 64 }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
    /** Set when verified successfully or superseded by a newer challenge. */
    consumedAt: timestamptz('consumed_at'),
    createdAt: createdAt(),
  },
  (t) => [index('otp_challenges_destination_created_idx').on(t.destination, t.createdAt)],
);

/**
 * Rotating refresh tokens. Only a SHA-256 hash is stored. Tokens issued from one login
 * share a family; presenting an already-rotated token revokes the whole family (theft detection).
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: idColumn(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
    revokedAt: timestamptz('revoked_at'),
    replacedById: uuid('replaced_by_id'),
    userAgent: varchar('user_agent', { length: 255 }),
    /** The login passed the authenticator step (ADR-0018); kept when the token rotates. */
    mfa: boolean('mfa').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('refresh_tokens_token_hash_key').on(t.tokenHash),
    index('refresh_tokens_user_id_idx').on(t.userId),
    index('refresh_tokens_family_id_idx').on(t.familyId),
  ],
);

/**
 * Authenticator-app 2-step login (ADR-0018). One row per user who set it up. The TOTP secret is
 * encrypted (AES-256-GCM, key derived from OTP_HASH_SECRET); `last_step` stops a code being reused.
 */
export const userMfa = pgTable('user_mfa', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  secretEnc: text('secret_enc').notNull(),
  lastStep: bigint('last_step', { mode: 'number' }),
  enabledAt: timestamptz('enabled_at').notNull(),
});

/** Single-use recovery codes for a lost phone. Only a SHA-256 hash is stored. */
export const mfaRecoveryCodes = pgTable(
  'mfa_recovery_codes',
  {
    id: idColumn(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: char('code_hash', { length: 64 }).notNull(),
    usedAt: timestamptz('used_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('mfa_recovery_codes_user_idx').on(t.userId),
    uniqueIndex('mfa_recovery_codes_hash_key').on(t.codeHash),
  ],
);
