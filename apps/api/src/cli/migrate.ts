// Usage: pnpm db:migrate — applies pending SQL migrations from database/migrations.
import { loadEnvFile } from '../config/load-env-file.js';
import { parseEnv } from '../config/env.schema.js';
import { runMigrations } from '../infrastructure/database/migrate.js';

loadEnvFile();
const { DATABASE_URL } = parseEnv(process.env);
await runMigrations(DATABASE_URL);
console.log('Migrations applied.');
