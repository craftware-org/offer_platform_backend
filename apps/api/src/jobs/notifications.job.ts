import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { NotificationsService } from '../modules/notifications/notifications.service.js';

export const NOTIFICATIONS_QUEUE = 'notifications';

type JobName = 'email-outbox' | 'ending-soon' | 'admin-summary';

/** Notification work done by the worker (ADR-0016). Each job is idempotent. */
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  async process(job: Job<unknown, unknown, JobName>): Promise<unknown> {
    switch (job.name) {
      case 'email-outbox':
        return this.notifications.sendPendingEmails();
      case 'ending-soon':
        return { created: await this.notifications.notifyEndingSoon() };
      case 'admin-summary':
        return { created: await this.notifications.sendAdminDailySummary() };
      default:
        return null;
    }
  }
}

/** Registers (idempotently) the repeating notification jobs when the worker starts. */
@Injectable()
export class NotificationsScheduler implements OnModuleInit {
  private readonly logger = new Logger(NotificationsScheduler.name);

  constructor(@InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    const opts = { removeOnComplete: 100, removeOnFail: 500 };
    await this.queue.upsertJobScheduler('email-outbox', { every: 60_000 }, { name: 'email-outbox', opts });
    // Five minutes past every hour.
    await this.queue.upsertJobScheduler('ending-soon', { pattern: '5 * * * *' }, { name: 'ending-soon', opts });
    // 09:00 every day, India time.
    await this.queue.upsertJobScheduler(
      'admin-summary',
      { pattern: '0 9 * * *', tz: 'Asia/Kolkata' },
      { name: 'admin-summary', opts },
    );
    this.logger.log('Notification jobs scheduled: email outbox every minute, ending-soon hourly, admin summary 09:00 IST');
  }
}
