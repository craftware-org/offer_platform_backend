// Usage: pnpm openapi:export — writes openapi.json (the API contract for web/admin/mobile clients).
// Needs a valid environment but no running database or Redis (connections are lazy).
import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../app.module.js';
import { APP_OPTIONS, buildOpenApiDocument, configureApp } from '../app.setup.js';
import { loadEnvFile } from '../config/load-env-file.js';

loadEnvFile();
const app = await NestFactory.create<NestExpressApplication>(AppModule, { ...APP_OPTIONS, logger: false });
const config = configureApp(app);
writeFileSync('openapi.json', JSON.stringify(buildOpenApiDocument(app, config), null, 2));
await app.close();
console.log('Wrote openapi.json');
