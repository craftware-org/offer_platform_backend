// Usage: pnpm admin:reset-mfa --email someone@example.com
//        pnpm admin:reset-mfa --phone +919845012345
// Emergency only (ADR-0018): clears a user's authenticator and recovery codes and ends their
// sessions, e.g. when the only Super admin lost their phone, or after OTP_HASH_SECRET was rotated.
// Day to day, a Super admin resets others from the website (Users → user → Reset 2-step login).
import { parseArgs } from 'node:util';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import pg from 'pg';
import { loadEnvFile } from '../config/load-env-file.js';
import { parseEnv } from '../config/env.schema.js';
import { createDatabase } from '../infrastructure/database/database.module.js';
import { normalizePhone } from '../common/phone/phone.js';
import { AuditAction, AuditService } from '../modules/audit/audit.service.js';
import { mfaRecoveryCodes, refreshTokens, userMfa } from '../modules/auth/auth.schema.js';
import { users } from '../modules/users/users.schema.js';

const { values } = parseArgs({ options: { phone: { type: 'string' }, email: { type: 'string' } } });
if (!values.phone === !values.email) {
  console.error('Usage: --phone <number> | --email <address>');
  process.exit(1);
}

loadEnvFile();
const env = parseEnv(process.env);
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
try {
  const db = createDatabase(pool);
  const where = values.phone
    ? eq(users.phone, normalizePhone(values.phone, env.DEFAULT_PHONE_COUNTRY))
    : and(eq(users.email, values.email!.trim().toLowerCase()), isNotNull(users.emailVerifiedAt));
  const [user] = await db.select().from(users).where(where);
  if (!user) {
    console.error(`No account with that ${values.phone ? 'phone' : 'verified email'}.`);
    process.exitCode = 1;
  } else {
    await db.transaction(async (tx) => {
      const removed = await tx
        .delete(userMfa)
        .where(eq(userMfa.userId, user.id))
        .returning({ id: userMfa.userId });
      await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, user.id));
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));
      await new AuditService(db).record(
        {
          actorUserId: null,
          action: AuditAction.MFA_RESET,
          entityType: 'user',
          entityId: user.id,
          newValue: { via: 'cli' },
        },
        tx,
      );
      console.log(
        removed.length
          ? '2-step login cleared and sessions ended. The person sets up their authenticator again at their next admin visit.'
          : 'This account had no authenticator set up; sessions ended anyway.',
      );
    });
  }
} finally {
  await pool.end();
}
