import { char, index, integer, pgEnum, pgTable, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
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
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('refresh_tokens_token_hash_key').on(t.tokenHash),
    index('refresh_tokens_user_id_idx').on(t.userId),
    index('refresh_tokens_family_id_idx').on(t.familyId),
  ],
);
