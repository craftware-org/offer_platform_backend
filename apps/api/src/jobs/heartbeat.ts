import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../infrastructure/redis/redis.token.js';

/** Valkey key the worker refreshes; read by GET /health/worker (Phase 9 monitoring). */
export const WORKER_HEARTBEAT_KEY = 'worker:heartbeat';
const EVERY_MS = 60_000;

/**
 * The worker says "I'm alive" every minute. If it crashes or hangs, the key goes stale and the
 * monitoring check (GET /api/v1/health/worker) starts failing.
 */
@Injectable()
export class WorkerHeartbeat implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerHeartbeat.name);
  private timer?: NodeJS.Timeout;

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  onModuleInit(): void {
    void this.beat();
    this.timer = setInterval(() => void this.beat(), EVERY_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private async beat(): Promise<void> {
    try {
      await this.redis.set(WORKER_HEARTBEAT_KEY, new Date().toISOString(), 'EX', 24 * 3600);
    } catch (error) {
      this.logger.warn({ err: error }, 'Could not write the worker heartbeat');
    }
  }
}
