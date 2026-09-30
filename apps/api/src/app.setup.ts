import type { NestApplicationOptions } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import helmet from 'helmet';
import { bodyParserErrorMiddleware } from './common/http/body-parser-error.middleware.js';
import { requestIdMiddleware } from './common/http/request-id.middleware.js';
import { APP_CONFIG, type AppConfig } from './config/config.module.js';

export const API_PREFIX = 'api/v1';
const JSON_BODY_LIMIT = '100kb';

/** Nest's default body parser is disabled so the request-id middleware can run before it. */
export const APP_OPTIONS: NestApplicationOptions = { bodyParser: false };

/** HTTP-level setup shared by main.ts and the integration tests, so tests run the real stack. */
export function configureApp(app: NestExpressApplication): AppConfig {
  const config = app.get<AppConfig>(APP_CONFIG);
  app.use(requestIdMiddleware);
  app.setGlobalPrefix(API_PREFIX);
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.use(helmet());
  app.enableCors({
    origin: config.CORS_ORIGINS,
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
  });
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.use(bodyParserErrorMiddleware);
  app.enableShutdownHooks();
  return config;
}

export function buildOpenApiDocument(app: NestExpressApplication, config: AppConfig): OpenAPIObject {
  const document = new DocumentBuilder()
    .setTitle(`${config.APP_DISPLAY_NAME} API`)
    .setDescription(
      'All responses use the envelope { success, data, meta? } or { success: false, error: { code, message, fields? }, requestId }.',
    )
    .setVersion('1')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, document);
}
