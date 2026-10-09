import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { AuditService } from '../modules/audit/audit.service.js';
import { AuthDataService } from '../modules/auth/auth-data.module.js';
import { NotificationsService } from '../modules/notifications/notifications.service.js';

export const MAINTENANCE_QUEUE = 'maintenance';

/**
 * How long personal data is kept (owner decision 2026-10-09, "longer" option). Analytics has its
 * own rule (raw events and searches 180 days, ADR-0017).
 */
export const RETENTION = {
  loginCodesDays: 90,
  endedSessionsDays: 90,
  notificationsDays: 365,
  activityLogYears: 7,
} as const;

const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000);

/** Deletes data that is past its retention period. Idempotent. */
@Injectable()
export class RetentionService {
  constructor(
    private readonly authData: AuthDataService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async run(now = new Date()) {
    const activityCutoff = new Date(now);
    activityCutoff.setUTCFullYear(activityCutoff.getUTCFullYear() - RETENTION.activityLogYears);
    return {
      loginCodes: await this.authData.purgeLoginCodes(daysAgo(now, RETENTION.loginCodesDays)),
      sessions: await this.authData.purgeEndedSessions(daysAgo(now, RETENTION.endedSessionsDays)),
      notifications: await this.notifications.purgeBefore(daysAgo(now, RETENTION.notificationsDays)),
      activityLog: await this.audit.purgeBefore(activityCutoff),
    };
  }
}

@Processor(MAINTENANCE_QUEUE)
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(private readonly retention: RetentionService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name !== 'retention') return null;
    const deleted = await this.retention.run();
    this.logger.log({ deleted }, 'Retention clean-up done');
    return deleted;
  }
}

/** Registers (idempotently) the nightly clean-up when the worker starts. */
@Injectable()
export class MaintenanceScheduler implements OnModuleInit {
  private readonly logger = new Logger(MaintenanceScheduler.name);

  constructor(@InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    // 03:00 India time, after the 02:30 backup.
    await this.queue.upsertJobScheduler(
      'retention',
      { pattern: '0 3 * * *', tz: 'Asia/Kolkata' },
      { name: 'retention', opts: { removeOnComplete: 30, removeOnFail: 100 } },
    );
    this.logger.log('Maintenance jobs scheduled: retention clean-up 03:00 IST');
  }
}
