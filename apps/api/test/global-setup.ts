import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../src/infrastructure/database/migrate.js';

// Same images as docker-compose.yml, so tests run against what developers and production use.
const POSTGRES_IMAGE = 'postgis/postgis:17-3.5';
const VALKEY_IMAGE = 'valkey/valkey:8.0-alpine';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    redisUrl: string;
  }
}

let postgres: StartedPostgreSqlContainer | undefined;
let valkey: StartedTestContainer | undefined;

/** Starts throwaway Postgres/PostGIS + Valkey containers once for the whole integration run. */
export async function setup(project: TestProject): Promise<void> {
  [postgres, valkey] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE).start(),
    new GenericContainer(VALKEY_IMAGE)
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
      .start(),
  ]);
  const databaseUrl = postgres.getConnectionUri();
  await runMigrations(databaseUrl);
  project.provide('databaseUrl', databaseUrl);
  project.provide('redisUrl', `redis://${valkey.getHost()}:${valkey.getMappedPort(6379)}`);
}

export async function teardown(): Promise<void> {
  await Promise.all([postgres?.stop(), valkey?.stop()]);
}
