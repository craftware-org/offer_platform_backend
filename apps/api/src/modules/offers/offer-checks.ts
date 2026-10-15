import { HttpStatus } from '@nestjs/common';
import { AppError, ErrorCode, type FieldErrors } from '../../common/errors/app-error.js';
import type { BusinessRow } from '../businesses/businesses.schema.js';
import type { SettingValue } from '../platform-settings/settings.registry.js';
import type { OfferRow } from './offers.schema.js';

const DAY_MS = 86_400_000;

/**
 * Offers of platform listings copy a brand's public deal, which can change without notice, so they
 * run a week at most and an admin re-checks the brand's page before listing them again.
 */
export const LISTED_OFFER_MAX_DAYS = 7;

/**
 * Automated validation run before an offer reaches the admin queue (spec §22).
 * Structural rules (prices, types) are already enforced by the input schema and DB constraints;
 * these are the rules that depend on the current time, settings and the business.
 */
export function assertReadyForReview(
  offer: Pick<OfferRow, 'startsAt' | 'expiresAt'>,
  business: Pick<BusinessRow, 'status'> & Partial<Pick<BusinessRow, 'listedByPlatform'>>,
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
  const maxDays = business.listedByPlatform
    ? Math.min(limits.maxDurationDays, LISTED_OFFER_MAX_DAYS)
    : limits.maxDurationDays;
  if (offer.expiresAt.getTime() - offer.startsAt.getTime() > maxDays * DAY_MS) {
    fields.expiresAt = business.listedByPlatform
      ? `An offer of a listed shop can run for at most ${maxDays} days: re-check the brand's page and list it again after that`
      : `An offer can run for at most ${maxDays} days`;
  }
  if (Object.keys(fields).length > 0) throw AppError.validation(fields, 'The offer is not ready for review');
}
