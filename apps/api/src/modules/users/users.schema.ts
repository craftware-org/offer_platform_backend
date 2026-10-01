import { index, pgEnum, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { createdAt, idColumn, timestamptz, updatedAt } from '../../infrastructure/database/columns.js';

export const userStatus = pgEnum('user_status', ['ACTIVE', 'SUSPENDED', 'DELETED']);
export type UserStatus = (typeof userStatus.enumValues)[number];

export const users = pgTable(
  'users',
  {
    id: idColumn(),
    /** E.164 (e.g. +919845012345). Cleared when the account is deleted. */
    phone: varchar('phone', { length: 20 }),
    name: varchar('name', { length: 100 }),
    /** Stored lower-case. Only used for login once `emailVerifiedAt` is set. */
    email: varchar('email', { length: 254 }),
    status: userStatus('status').notNull().default('ACTIVE'),
    phoneVerifiedAt: timestamptz('phone_verified_at'),
    /** Set only after the user proved control of the email with a code. Unverified emails never log anyone in. */
    emailVerifiedAt: timestamptz('email_verified_at'),
    /** Argon2id hash in PHC format (ADR-0015). Null until the user sets a password. Never returned by the API. */
    passwordHash: varchar('password_hash', { length: 255 }),
    passwordChangedAt: timestamptz('password_changed_at'),
    lastLoginAt: timestamptz('last_login_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamptz('deleted_at'),
  },
  (t) => [
    uniqueIndex('users_phone_key').on(t.phone),
    uniqueIndex('users_email_key').on(t.email),
    index('users_status_idx').on(t.status),
  ],
);

export type UserRow = typeof users.$inferSelect;
