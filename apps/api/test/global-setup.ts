import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../src/infrastructure/database/migrate.js';

// Same images as docker-compose.yml, so tests run against what developers and production use.
const POSTGRES_IMAGE = 'postgis/postgis:17-3.5';
const VALKEY_IMAGE = 'valkey/valkey:8.0-alpine';
/** Fully migrated database that each test file clones (CREATE DATABASE … TEMPLATE, ~100 ms). */
export const TEMPLATE_DATABASE = 'offer_platform_template';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Connection URL of the server's maintenance database (used to create per-file databases). */
    adminDatabaseUrl: string;
    templateDatabase: string;
    redisUrl: string;
  }
}

let postgres: StartedPostgreSqlContainer | undefined;
let valkey: StartedTestContainer | undefined;

export const withDatabase = (url: string, database: string) => {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
};

/** Starts throwaway Postgres/PostGIS + Valkey containers once; builds the migrated template database. */
export async function setup(project: TestProject): Promise<void> {
  [postgres, valkey] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE).start(),
    new GenericContainer(VALKEY_IMAGE)
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
      .start(),
  ]);
  const adminUrl = withDatabase(postgres.getConnectionUri(), 'postgres');
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${TEMPLATE_DATABASE}`);
  } finally {
    await admin.end();
  }
  await runMigrations(withDatabase(adminUrl, TEMPLATE_DATABASE)); // closes its connection when done

  project.provide('adminDatabaseUrl', adminUrl);
  project.provide('templateDatabase', TEMPLATE_DATABASE);
  project.provide('redisUrl', `redis://${valkey.getHost()}:${valkey.getMappedPort(6379)}`);
}

export async function teardown(): Promise<void> {
  await Promise.all([postgres?.stop(), valkey?.stop()]);
}
