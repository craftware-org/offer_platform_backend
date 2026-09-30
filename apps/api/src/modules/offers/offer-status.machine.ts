import { HttpStatus } from '@nestjs/common';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import type { OfferStatus } from './offers.schema.js';

/**
 * Offer lifecycle (every offer is reviewed by an admin):
 *
 *   DRAFT ──SUBMIT──▶ PENDING_REVIEW ──APPROVE──▶ SCHEDULED ──(start)──▶ ACTIVE ──(end)──▶ EXPIRED
 *     ▲                 │    │    │                  (APPROVE after start ──────▶ ACTIVE)
 *     ├──WITHDRAW───────┘    │    └──REJECT──▶ REJECTED ──SUBMIT──▶ PENDING_REVIEW
 *     └──REQUEST_CHANGES─────┘
 *   ACTIVE ⇄ PAUSED (business)          SCHEDULED/ACTIVE/PAUSED ──END──▶ EXPIRED (business ends early)
 *   live or in review ──SUSPEND──▶ SUSPENDED ──REACTIVATE──▶ SCHEDULED / ACTIVE / EXPIRED (by dates)
 *   the worker: SCHEDULED→ACTIVE at start; SCHEDULED/ACTIVE/PAUSED/PENDING_REVIEW→EXPIRED at end
 */
export type OfferAction =
  | 'SUBMIT'
  | 'WITHDRAW'
  | 'APPROVE'
  | 'REJECT'
  | 'REQUEST_CHANGES'
  | 'PAUSE'
  | 'RESUME'
  | 'END'
  | 'SUSPEND'
  | 'REACTIVATE';

const ALLOWED_FROM: Record<OfferAction, readonly OfferStatus[]> = {
  SUBMIT: ['DRAFT', 'REJECTED'],
  WITHDRAW: ['PENDING_REVIEW'],
  APPROVE: ['PENDING_REVIEW'],
  REJECT: ['PENDING_REVIEW'],
  REQUEST_CHANGES: ['PENDING_REVIEW'],
  PAUSE: ['ACTIVE'],
  RESUME: ['PAUSED'],
  END: ['SCHEDULED', 'ACTIVE', 'PAUSED'],
  SUSPEND: ['PENDING_REVIEW', 'SCHEDULED', 'ACTIVE', 'PAUSED'],
  REACTIVATE: ['SUSPENDED'],
};

export interface OfferDates {
  startsAt: Date;
  expiresAt: Date;
}

/** Where a reviewed offer belongs right now, based purely on its dates. */
export function scheduledStatusAt(dates: OfferDates, now: Date): 'SCHEDULED' | 'ACTIVE' | 'EXPIRED' {
  if (dates.expiresAt <= now) return 'EXPIRED';
  return dates.startsAt > now ? 'SCHEDULED' : 'ACTIVE';
}

export function nextOfferStatus(
  current: OfferStatus,
  action: OfferAction,
  dates: OfferDates,
  now: Date,
): OfferStatus {
  if (!ALLOWED_FROM[action].includes(current)) {
    throw new AppError(
      ErrorCode.INVALID_STATUS_TRANSITION,
      HttpStatus.CONFLICT,
      `Cannot ${action.toLowerCase().replace('_', ' ')} an offer that is ${current}`,
    );
  }
  const expired = dates.expiresAt <= now;
  switch (action) {
    case 'SUBMIT':
    case 'APPROVE':
    case 'RESUME':
      if (expired) {
        throw new AppError(
          ErrorCode.INVALID_STATUS_TRANSITION,
          HttpStatus.CONFLICT,
          'The offer end date has already passed',
        );
      }
      return action === 'SUBMIT'
        ? 'PENDING_REVIEW'
        : action === 'RESUME'
          ? 'ACTIVE'
          : scheduledStatusAt(dates, now);
    case 'WITHDRAW':
    case 'REQUEST_CHANGES':
      return 'DRAFT';
    case 'REJECT':
      return 'REJECTED';
    case 'PAUSE':
      return 'PAUSED';
    case 'END':
      return 'EXPIRED';
    case 'SUSPEND':
      return 'SUSPENDED';
    case 'REACTIVATE':
      return scheduledStatusAt(dates, now);
  }
}

/** Statuses in which a business may edit the offer content. */
export const EDITABLE_STATUSES: readonly OfferStatus[] = [
  'DRAFT',
  'REJECTED',
  'SCHEDULED',
  'ACTIVE',
  'PAUSED',
];

/** Editing an approved (live or upcoming) offer sends it back to review; it is hidden until re-approved. */
export const LIVE_STATUSES: readonly OfferStatus[] = ['SCHEDULED', 'ACTIVE', 'PAUSED'];

/** Statuses visible on the public offer page (lists show only ACTIVE). */
export const PUBLIC_STATUSES: readonly OfferStatus[] = ['ACTIVE', 'PAUSED', 'EXPIRED'];

/** Business-side actions available now (drives the UI buttons). */
export function availableBusinessActions(status: OfferStatus, dates: OfferDates, now: Date): string[] {
  const actions: string[] = [];
  if (EDITABLE_STATUSES.includes(status)) actions.push('EDIT');
  for (const action of ['SUBMIT', 'WITHDRAW', 'PAUSE', 'RESUME', 'END'] as const) {
    try {
      nextOfferStatus(status, action, dates, now);
      actions.push(action);
    } catch {
      // not available
    }
  }
  return actions;
}
