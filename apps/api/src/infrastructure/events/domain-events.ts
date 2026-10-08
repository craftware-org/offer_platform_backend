import { Global, Injectable, Logger, Module } from '@nestjs/common';

/**
 * Facts modules announce after their transaction commits (ADR-0016). Subscribers (notifications)
 * react without the announcing module knowing about them, which keeps module dependencies one-way.
 */
export interface DomainEventMap {
  /** An admin verified, rejected, suspended or reactivated a business. */
  'business.status_changed': { businessId: string; action: string; status: string; reason: string | null };
  /** An admin warned a business about one of its offers (from a customer report). */
  'business.warned': { businessId: string; offerId: string; message: string };
  /** An admin approved / rejected / requested changes to / suspended / reactivated an offer. */
  'offer.moderated': { offerId: string; action: string; status: string; reason: string | null };
  /** Offers that just became visible to customers (approval, or the worker reaching the start time). */
  'offer.went_live': { offerIds: string[] };
}
export type DomainEventName = keyof DomainEventMap;
type Handler<K extends DomainEventName> = (payload: DomainEventMap[K]) => Promise<void> | void;

@Injectable()
export class DomainEvents {
  private readonly logger = new Logger('DomainEvents');
  private readonly handlers = new Map<DomainEventName, Handler<DomainEventName>[]>();

  on<K extends DomainEventName>(name: K, handler: Handler<K>): void {
    const list = this.handlers.get(name) ?? [];
    list.push(handler as Handler<DomainEventName>);
    this.handlers.set(name, list);
  }

  /**
   * Runs every handler and waits for them, but a failing handler is only logged: announcing an
   * event must never fail the action that caused it (e.g. an admin's approval).
   */
  async emit<K extends DomainEventName>(name: K, payload: DomainEventMap[K]): Promise<void> {
    for (const handler of this.handlers.get(name) ?? []) {
      try {
        await handler(payload);
      } catch (error) {
        this.logger.error({ err: error, event: name }, 'Domain event handler failed');
      }
    }
  }
}

@Global()
@Module({ providers: [DomainEvents], exports: [DomainEvents] })
export class DomainEventsModule {}
