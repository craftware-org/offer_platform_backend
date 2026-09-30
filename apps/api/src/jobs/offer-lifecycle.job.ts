import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';
import { OfferLifecycleService } from '../modules/offers/offer-lifecycle.service.js';

export const OFFER_LIFECYCLE_QUEUE = 'offer-lifecycle';
const SCHEDULER_ID = 'offer-lifecycle-tick';

/** Runs the time-driven offer transitions. BullMQ guarantees one worker handles each tick. */
@Processor(OFFER_LIFECYCLE_QUEUE)
export class OfferLifecycleProcessor extends WorkerHost {
  constructor(private readonly lifecycle: OfferLifecycleService) {
    super();
  }

  async process(): Promise<{ activated: number; expired: number }> {
    return this.lifecycle.runTransitions();
  }
}

/** Registers (idempotently) the repeating job when the worker starts. */
@Injectable()
export class OfferLifecycleScheduler implements OnModuleInit {
  private readonly logger = new Logger(OfferLifecycleScheduler.name);

  constructor(
    @InjectQueue(OFFER_LIFECYCLE_QUEUE) private readonly queue: Queue,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    const every = this.config.OFFER_LIFECYCLE_INTERVAL_MS;
    await this.queue.upsertJobScheduler(
      SCHEDULER_ID,
      { every },
      { name: 'tick', opts: { removeOnComplete: 100, removeOnFail: 500 } },
    );
    this.logger.log(`Offer lifecycle runs every ${every} ms`);
  }
}
