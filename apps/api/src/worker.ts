import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { loadEnvFile } from './config/load-env-file.js';
import { WorkerModule } from './worker.module.js';

async function bootstrap() {
  loadEnvFile();
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.get(Logger).log('Worker started');
}
await bootstrap();
