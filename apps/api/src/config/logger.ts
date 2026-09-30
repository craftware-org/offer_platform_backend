import type { Params } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import type { AppConfig } from './config.module.js';

/** Logging configuration shared by the API and the worker. */
export function loggerParams(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL,
      // requestIdMiddleware (app.setup.ts) already assigned the id; reuse it.
      genReqId: (req) => (req as { id?: string }).id ?? uuidv7(),
      // Never log credentials or tokens.
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } }
          : undefined,
    },
  };
}
