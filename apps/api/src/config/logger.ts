import type { Params } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import type { AppConfig } from './config.module.js';

/**
 * Customer coordinates (lat/lng query parameters) are personal data and are never needed in
 * logs (spec §10: don't track location). They are masked in logged URLs and query objects.
 */
const COORDINATE_PARAMS = /([?&](?:lat|lng|latitude|longitude)=)[^&]*/gi;

export function maskCoordinates(url: string): string {
  return url.replace(COORDINATE_PARAMS, '$1~');
}

/** Logging configuration shared by the API and the worker. */
export function loggerParams(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL,
      serializers: {
        req: (req: { url?: string; query?: Record<string, unknown> }) => {
          if (req.url) req.url = maskCoordinates(req.url);
          if (req.query) {
            for (const key of ['lat', 'lng', 'latitude', 'longitude']) {
              if (key in req.query) req.query[key] = '~';
            }
          }
          return req;
        },
      },
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
