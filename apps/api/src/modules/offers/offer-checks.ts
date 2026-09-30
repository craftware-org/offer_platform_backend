import { HttpStatus } from '@nestjs/common';
import { AppError, ErrorCode, type FieldErrors } from '../../common/errors/app-error.js';
import type { BusinessRow } from '../businesses/businesses.schema.js';
import type { SettingValue } from '../platform-settings/settings.registry.js';
import type { OfferRow } from './offers.schema.js';

const DAY_MS = 86_400_000;

/**
 * Automated validation run before an offer reaches the admin queue (spec §22).
 * Structural rules (prices, types) are already enforced by the input schema and DB constraints;
 * these are the rules that depend on the current time, settings and the business.
 */
export function assertReadyForReview(
  offer: Pick<OfferRow, 'startsAt' | 'expiresAt'>,
  business: Pick<BusinessRow, 'status'>,
  limits: SettingValue<'offers.limits'>,
  now: Date,
): void {
  if (business.status !== 'VERIFIED') {
    throw new AppError(
      ErrorCode.BUSINESS_NOT_VERIFIED,
      HttpStatus.FORBIDDEN,
      'Only verified businesses can publish offers. Complete business verification first.',
    );
  }
  const fields: FieldErrors = {};
  if (offer.expiresAt <= now) fields.expiresAt = 'The end date has already passed';
  if (offer.expiresAt.getTime() - offer.startsAt.getTime() > limits.maxDurationDays * DAY_MS) {
    fields.expiresAt = `An offer can run for at most ${limits.maxDurationDays} days`;
  }
  if (Object.keys(fields).length > 0) throw AppError.validation(fields, 'The offer is not ready for review');
}
