import { assertReadyForReview } from './offer-checks.js';

const now = new Date('2026-10-05T10:00:00Z');
const days = (d: number) => new Date(now.getTime() + d * 86_400_000);
const limits = { maxDurationDays: 90, maxImages: 5 };
const verified = { status: 'VERIFIED' as const };

describe('assertReadyForReview', () => {
  it('accepts a valid offer from a verified business', () => {
    expect(() =>
      assertReadyForReview({ startsAt: now, expiresAt: days(7) }, verified, limits, now),
    ).not.toThrow();
    expect(() =>
      assertReadyForReview({ startsAt: now, expiresAt: days(90) }, verified, limits, now),
    ).not.toThrow();
  });

  it.each(['PENDING', 'UNDER_REVIEW', 'REJECTED', 'SUSPENDED'] as const)(
    'refuses offers from a %s business',
    (status) => {
      expect(() =>
        assertReadyForReview({ startsAt: now, expiresAt: days(7) }, { status }, limits, now),
      ).toThrow(expect.objectContaining({ code: 'BUSINESS_NOT_VERIFIED' }));
    },
  );

  it('refuses offers longer than the configured maximum', () => {
    expect(() => assertReadyForReview({ startsAt: now, expiresAt: days(91) }, verified, limits, now)).toThrow(
      expect.objectContaining({ fields: { expiresAt: 'An offer can run for at most 90 days' } }),
    );
    const longer = { maxDurationDays: 120, maxImages: 5 };
    expect(() =>
      assertReadyForReview({ startsAt: now, expiresAt: days(91) }, verified, longer, now),
    ).not.toThrow();
  });

  it('refuses offers that already ended', () => {
    expect(() =>
      assertReadyForReview({ startsAt: days(-10), expiresAt: days(-1) }, verified, limits, now),
    ).toThrow(expect.objectContaining({ fields: { expiresAt: 'The end date has already passed' } }));
  });
});
