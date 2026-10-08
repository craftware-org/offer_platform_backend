import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { AnalyticsService } from '../modules/analytics/analytics.service.js';

export const ANALYTICS_QUEUE = 'analytics';

type JobName = 'nightly' | 'weekly-summary';

/** Analytics work done by the worker (ADR-0017). Each job is idempotent. */
@Processor(ANALYTICS_QUEUE)
export class AnalyticsProcessor extends WorkerHost {
  constructor(private readonly analytics: AnalyticsService) {
    super();
  }

  async process(job: Job<unknown, unknown, JobName>): Promise<unknown> {
    switch (job.name) {
      case 'nightly':
        return { rollup: await this.analytics.rollup(), purged: await this.analytics.purge() };
      case 'weekly-summary':
        return { created: await this.analytics.sendWeeklySummaries() };
      default:
        return null;
    }
  }
}

/** Registers (idempotently) the repeating analytics jobs when the worker starts. */
@Injectable()
export class AnalyticsScheduler implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsScheduler.name);

  constructor(@InjectQueue(ANALYTICS_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    const opts = { removeOnComplete: 50, removeOnFail: 200 };
    // 00:30 every night, India time: daily totals, then the 180-day clean-up.
    await this.queue.upsertJobScheduler('nightly', { pattern: '30 0 * * *', tz: 'Asia/Kolkata' }, { name: 'nightly', opts });
    // Also once now, so days missed while the worker was down (or before the first night after a
    // deploy) show on the dashboards straight away. Safe to repeat: the job is idempotent.
    await this.queue.add('nightly', {}, opts);
    // Mondays 09:00, India time.
    await this.queue.upsertJobScheduler(
      'weekly-summary',
      { pattern: '0 9 * * 1', tz: 'Asia/Kolkata' },
      { name: 'weekly-summary', opts },
    );
    this.logger.log('Analytics jobs scheduled: daily totals now and at 00:30 IST, weekly business summary Mondays 09:00 IST');
  }
}
