import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gt, inArray, lte } from 'drizzle-orm';
import { DB, type Database } from '../../infrastructure/database/database.module.js';
import { offers } from './offers.schema.js';

/**
 * Time-driven transitions, run by the worker every minute. Each is a single conditional UPDATE,
 * so running it twice, late, or on several workers at once is harmless (idempotent).
 * Public queries ALSO filter by date, so correctness never depends on this running on time.
 */
@Injectable()
export class OfferLifecycleService {
  private readonly logger = new Logger(OfferLifecycleService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  async runTransitions(now = new Date()): Promise<{ activated: number; expired: number }> {
    const expired = await this.db
      .update(offers)
      .set({ status: 'EXPIRED' })
      .where(
        and(
          inArray(offers.status, ['SCHEDULED', 'ACTIVE', 'PAUSED', 'PENDING_REVIEW']),
          lte(offers.expiresAt, now),
        ),
      )
      .returning({ id: offers.id });

    const activated = await this.db
      .update(offers)
      .set({ status: 'ACTIVE' })
      .where(and(eq(offers.status, 'SCHEDULED'), lte(offers.startsAt, now), gt(offers.expiresAt, now)))
      .returning({ id: offers.id });

    if (expired.length || activated.length) {
      this.logger.log(
        { activated: activated.length, expired: expired.length },
        'Offer lifecycle transitions',
      );
    }
    return { activated: activated.length, expired: expired.length };
  }
}
