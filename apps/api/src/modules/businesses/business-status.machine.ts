import { HttpStatus } from '@nestjs/common';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import type { BusinessStatus } from './businesses.schema.js';

/**
 * Business verification lifecycle:
 *
 *   PENDING ──SUBMIT──▶ UNDER_REVIEW ──VERIFY──▶ VERIFIED
 *      ▲                     │
 *      └──(owner edits)── REJECTED ◀──REJECT──┘   REJECTED ──SUBMIT──▶ UNDER_REVIEW
 *
 *   any state except SUSPENDED ──SUSPEND──▶ SUSPENDED ──REACTIVATE──▶ VERIFIED (if it was verified) or PENDING
 */
export type BusinessAction = 'SUBMIT' | 'VERIFY' | 'REJECT' | 'SUSPEND' | 'REACTIVATE';

const ALLOWED_FROM: Record<BusinessAction, readonly BusinessStatus[]> = {
  SUBMIT: ['PENDING', 'REJECTED'],
  VERIFY: ['UNDER_REVIEW'],
  REJECT: ['UNDER_REVIEW'],
  SUSPEND: ['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED'],
  REACTIVATE: ['SUSPENDED'],
};

export function nextBusinessStatus(
  current: BusinessStatus,
  action: BusinessAction,
  context: { wasVerified: boolean },
): BusinessStatus {
  if (!ALLOWED_FROM[action].includes(current)) {
    throw new AppError(
      ErrorCode.INVALID_STATUS_TRANSITION,
      HttpStatus.CONFLICT,
      `Cannot ${action.toLowerCase()} a business that is ${current}`,
    );
  }
  switch (action) {
    case 'SUBMIT':
      return 'UNDER_REVIEW';
    case 'VERIFY':
      return 'VERIFIED';
    case 'REJECT':
      return 'REJECTED';
    case 'SUSPEND':
      return 'SUSPENDED';
    case 'REACTIVATE':
      return context.wasVerified ? 'VERIFIED' : 'PENDING';
  }
}

/** Details an admin checked during verification. The owner cannot change them while under review or verified. */
export const LOCKED_FIELDS = ['name', 'registrationNumber', 'phone', 'location'] as const;
export type LockedField = (typeof LOCKED_FIELDS)[number];

export const isLockedForOwner = (status: BusinessStatus) =>
  status === 'UNDER_REVIEW' || status === 'VERIFIED';

/** Verification photos can only change before submission or after a rejection. */
export const canChangeVerificationPhotos = (status: BusinessStatus) =>
  status === 'PENDING' || status === 'REJECTED';
