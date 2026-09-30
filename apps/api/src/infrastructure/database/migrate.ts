import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { createDatabase } from './database.module.js';

/** apps/api/database/migrations — same relative location from src/ and dist/. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../database/migrations', import.meta.url));

/** Applies all pending migrations. Used by the CLI, deployments and integration tests. */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(createDatabase(pool), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}
