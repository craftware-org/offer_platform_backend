// Usage: pnpm db:seed — syncs reference data (roles, permissions). Idempotent; run after every migrate.
import pg from 'pg';
import { loadEnvFile } from '../config/load-env-file.js';
import { parseEnv } from '../config/env.schema.js';
import { createDatabase } from '../infrastructure/database/database.module.js';
import { AccessControlService } from '../modules/access-control/access-control.service.js';

loadEnvFile();
const { DATABASE_URL } = parseEnv(process.env);
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
try {
  await new AccessControlService(createDatabase(pool)).syncCatalog();
  console.log('Roles and permissions synced.');
} finally {
  await pool.end();
}
