import { defineConfig } from 'drizzle-kit';

// Used only by `pnpm db:generate` (creates SQL migration files from the *.schema.ts tables).
// Migrations are applied by our own runner (src/cli/migrate.ts), identically in dev, CI and production.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/**/*.schema.ts',
  out: './database/migrations',
  strict: true,
  verbose: true,
});
