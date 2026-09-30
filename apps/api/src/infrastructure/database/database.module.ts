import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';
import * as schema from './schema.js';

export const DB = Symbol('DB');
const PG_POOL = Symbol('PG_POOL');

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Repositories accept either the root connection or an open transaction. */
export type Executor = Database | Transaction;

export function createDatabase(pool: pg.Pool): Database {
  return drizzle({ client: pool, schema });
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 }),
    },
    { provide: DB, inject: [PG_POOL], useFactory: createDatabase },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
