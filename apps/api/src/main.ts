import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { APP_OPTIONS, buildOpenApiDocument, configureApp } from './app.setup.js';
import { loadEnvFile } from './config/load-env-file.js';

async function bootstrap() {
  loadEnvFile();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    ...APP_OPTIONS,
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  const config = configureApp(app);

  if (config.NODE_ENV !== 'production') {
    SwaggerModule.setup('api/docs', app, buildOpenApiDocument(app, config));
  }

  await app.listen(config.PORT);
  app.get(Logger).log(`API listening on port ${config.PORT} (${config.NODE_ENV})`);
}
await bootstrap();
