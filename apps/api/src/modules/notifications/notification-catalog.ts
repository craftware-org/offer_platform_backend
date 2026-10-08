/**
 * Every notification type, who it is for and its defaults (owner decisions 2026-10-08, ADR-0016):
 * businesses and admins get email by default; customers get the inbox only unless they opt in.
 */
export const NOTIFICATION_TYPES = [
  'BUSINESS_VERIFIED',
  'BUSINESS_REJECTED',
  'BUSINESS_SUSPENDED',
  'BUSINESS_REACTIVATED',
  'BUSINESS_WARNED',
  'OFFER_APPROVED',
  'OFFER_REJECTED',
  'OFFER_CHANGES_REQUESTED',
  'OFFER_SUSPENDED',
  'OFFER_ENDING_SOON',
  'FOLLOWED_SHOP_NEW_OFFER',
  'SAVED_OFFER_ENDING',
  'ADMIN_DAILY_SUMMARY',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type Audience = 'BUSINESS' | 'CUSTOMER' | 'ADMIN';

export const CATALOG: Record<NotificationType, { audience: Audience; label: string }> = {
  BUSINESS_VERIFIED: { audience: 'BUSINESS', label: 'Your business is verified' },
  BUSINESS_REJECTED: { audience: 'BUSINESS', label: 'Your business verification was rejected' },
  BUSINESS_SUSPENDED: { audience: 'BUSINESS', label: 'Your business was suspended' },
  BUSINESS_REACTIVATED: { audience: 'BUSINESS', label: 'Your business was reactivated' },
  BUSINESS_WARNED: { audience: 'BUSINESS', label: 'A warning about one of your offers' },
  OFFER_APPROVED: { audience: 'BUSINESS', label: 'Your offer was approved' },
  OFFER_REJECTED: { audience: 'BUSINESS', label: 'Your offer was rejected' },
  OFFER_CHANGES_REQUESTED: { audience: 'BUSINESS', label: 'Changes requested to your offer' },
  OFFER_SUSPENDED: { audience: 'BUSINESS', label: 'Your offer was suspended' },
  OFFER_ENDING_SOON: { audience: 'BUSINESS', label: 'Your offer ends within a day' },
  FOLLOWED_SHOP_NEW_OFFER: { audience: 'CUSTOMER', label: 'A shop you follow posted a new offer' },
  SAVED_OFFER_ENDING: { audience: 'CUSTOMER', label: 'A saved offer ends within a day' },
  ADMIN_DAILY_SUMMARY: { audience: 'ADMIN', label: 'Daily summary of work waiting for admins' },
};

export interface Channels {
  inApp: boolean;
  email: boolean;
}

export const defaultChannels = (type: NotificationType): Channels => ({
  inApp: true,
  email: CATALOG[type].audience !== 'CUSTOMER',
});

/** India has no daylight saving: a fixed +05:30 offset is exact. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const QUIET_FROM_HOUR = 22;
const QUIET_UNTIL_HOUR = 8;

/**
 * Customer emails are not sent between 22:00 and 08:00 India time (owner decision 2026-10-08):
 * returns when the email may go out (`now` if outside quiet hours).
 */
export function customerEmailNotBefore(now: Date): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const hour = ist.getUTCHours();
  if (hour >= QUIET_UNTIL_HOUR && hour < QUIET_FROM_HOUR) return now;
  const release = new Date(ist);
  release.setUTCHours(QUIET_UNTIL_HOUR, 0, 0, 0);
  if (hour >= QUIET_FROM_HOUR) release.setUTCDate(release.getUTCDate() + 1);
  return new Date(release.getTime() - IST_OFFSET_MS);
}
