import { existsSync } from 'node:fs';

/**
 * Local convenience: load apps/api/.env into process.env (variables already set win).
 * Deployed environments get configuration from the platform, never from a file.
 */
export function loadEnvFile(path = '.env'): void {
  const env = process.env.NODE_ENV;
  if (env === 'production' || env === 'staging') return;
  if (existsSync(path)) process.loadEnvFile(path);
}
