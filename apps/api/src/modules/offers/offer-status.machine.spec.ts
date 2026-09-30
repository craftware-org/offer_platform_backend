import { AppError } from '../../common/errors/app-error.js';
import type { OfferStatus } from './offers.schema.js';
import {
  availableBusinessActions,
  nextOfferStatus,
  scheduledStatusAt,
  type OfferAction,
} from './offer-status.machine.js';

const now = new Date('2026-10-05T10:00:00Z');
const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);
const running = { startsAt: hours(-24), expiresAt: hours(24) };
const upcoming = { startsAt: hours(24), expiresAt: hours(48) };
const past = { startsAt: hours(-48), expiresAt: hours(-1) };

describe('scheduledStatusAt', () => {
  it('places an offer by its dates', () => {
    expect(scheduledStatusAt(upcoming, now)).toBe('SCHEDULED');
    expect(scheduledStatusAt(running, now)).toBe('ACTIVE');
    expect(scheduledStatusAt(past, now)).toBe('EXPIRED');
    expect(scheduledStatusAt({ startsAt: hours(-1), expiresAt: now }, now)).toBe('EXPIRED');
  });
});

describe('nextOfferStatus', () => {
  it.each<[OfferStatus, OfferAction, typeof running, OfferStatus]>([
    ['DRAFT', 'SUBMIT', running, 'PENDING_REVIEW'],
    ['REJECTED', 'SUBMIT', running, 'PENDING_REVIEW'],
    ['PENDING_REVIEW', 'WITHDRAW', running, 'DRAFT'],
    ['PENDING_REVIEW', 'APPROVE', upcoming, 'SCHEDULED'],
    ['PENDING_REVIEW', 'APPROVE', running, 'ACTIVE'],
    ['PENDING_REVIEW', 'REJECT', running, 'REJECTED'],
    ['PENDING_REVIEW', 'REQUEST_CHANGES', running, 'DRAFT'],
    ['ACTIVE', 'PAUSE', running, 'PAUSED'],
    ['PAUSED', 'RESUME', running, 'ACTIVE'],
    ['ACTIVE', 'END', running, 'EXPIRED'],
    ['SCHEDULED', 'END', upcoming, 'EXPIRED'],
    ['ACTIVE', 'SUSPEND', running, 'SUSPENDED'],
    ['SUSPENDED', 'REACTIVATE', running, 'ACTIVE'],
    ['SUSPENDED', 'REACTIVATE', upcoming, 'SCHEDULED'],
    ['SUSPENDED', 'REACTIVATE', past, 'EXPIRED'],
  ])('%s --%s--> %s', (from, action, dates, to) => {
    expect(nextOfferStatus(from, action, dates, now)).toBe(to);
  });

  it.each<[OfferStatus, OfferAction]>([
    ['DRAFT', 'APPROVE'],
    ['ACTIVE', 'APPROVE'],
    ['EXPIRED', 'RESUME'],
    ['EXPIRED', 'SUBMIT'],
    ['EXPIRED', 'SUSPEND'],
    ['SUSPENDED', 'RESUME'],
    ['DRAFT', 'PAUSE'],
    ['PENDING_REVIEW', 'PAUSE'],
    ['REJECTED', 'APPROVE'],
  ])('refuses %s --%s-->', (from, action) => {
    expect(() => nextOfferStatus(from, action, running, now)).toThrow(AppError);
  });

  it('cannot submit, approve or resume an offer whose end date has passed', () => {
    expect(() => nextOfferStatus('DRAFT', 'SUBMIT', past, now)).toThrow(/end date/);
    expect(() => nextOfferStatus('PENDING_REVIEW', 'APPROVE', past, now)).toThrow(/end date/);
    expect(() => nextOfferStatus('PAUSED', 'RESUME', past, now)).toThrow(/end date/);
  });
});

describe('availableBusinessActions', () => {
  it('reflects what the business can do', () => {
    expect(availableBusinessActions('DRAFT', running, now)).toEqual(['EDIT', 'SUBMIT']);
    expect(availableBusinessActions('PENDING_REVIEW', running, now)).toEqual(['WITHDRAW']);
    expect(availableBusinessActions('ACTIVE', running, now)).toEqual(['EDIT', 'PAUSE', 'END']);
    expect(availableBusinessActions('EXPIRED', past, now)).toEqual([]);
  });
});
