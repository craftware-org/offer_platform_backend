import { Global, Module } from '@nestjs/common';
import { parseEnv, type Env } from './env.schema.js';

/** Injection token for the validated, typed environment. */
export const APP_CONFIG = Symbol('APP_CONFIG');
export type AppConfig = Env;

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): AppConfig => parseEnv(process.env) }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
