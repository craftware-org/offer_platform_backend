// Usage: pnpm admin:grant-role --phone +919845012345 --role SUPER_ADMIN
//        pnpm admin:grant-role --email someone@example.com --role SUPER_ADMIN
// Bootstraps the first administrator. The person must have logged in once (so the account exists).
// An email counts only once it is verified (the person logged in with a code sent to it): an email
// merely typed into a profile must never receive a role.
import { parseArgs } from 'node:util';
import { and, eq, isNotNull } from 'drizzle-orm';
import pg from 'pg';
import { loadEnvFile } from '../config/load-env-file.js';
import { parseEnv } from '../config/env.schema.js';
import { createDatabase } from '../infrastructure/database/database.module.js';
import { Role } from '../modules/access-control/access-control.catalog.js';
import { AccessControlService } from '../modules/access-control/access-control.service.js';
import { AuditAction, AuditService } from '../modules/audit/audit.service.js';
import { normalizePhone } from '../common/phone/phone.js';
import { users } from '../modules/users/users.schema.js';

const { values } = parseArgs({
  options: { phone: { type: 'string' }, email: { type: 'string' }, role: { type: 'string' } },
});
const role = values.role as Role | undefined;
if (!values.phone === !values.email || !role || !(role in Role)) {
  console.error(`Usage: (--phone <number> | --email <address>) --role <${Object.keys(Role).join('|')}>`);
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
  if (!user || user.status !== 'ACTIVE') {
    console.error(
      `No active account with that ${values.phone ? 'phone' : 'verified email'}. Log in once via the app/API first.`,
    );
    process.exitCode = 1;
  } else {
    await db.transaction(async (tx) => {
      const granted = await new AccessControlService(db).grantRole(user.id, role, null, tx);
      if (granted) {
        await new AuditService(db).record(
          {
            actorUserId: null,
            action: AuditAction.ROLE_GRANTED,
            entityType: 'user',
            entityId: user.id,
            newValue: { role, via: 'cli' },
          },
          tx,
        );
      }
      console.log(granted ? `Granted ${role}.` : `User already has ${role}.`);
    });
  }
} finally {
  await pool.end();
}
