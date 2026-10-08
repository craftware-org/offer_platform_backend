import { describe, expect, it } from 'vitest';
import { describeActivity, type ActivityEntry } from './activity';

const entry = (over: Partial<ActivityEntry>): ActivityEntry => ({
  id: '1',
  at: '2026-10-02T04:45:00Z',
  action: 'BUSINESS_VERIFIED',
  entityType: 'business',
  entityId: 'b1',
  actor: { id: 'u1', name: 'Ravi' },
  entityLabel: 'Shoe House',
  oldValue: null,
  newValue: null,
  requestId: null,
  ...over,
});

describe('describeActivity', () => {
  it('names who did what to which item', () => {
    expect(describeActivity(entry({}))).toBe('Ravi verified business “Shoe House”');
    expect(describeActivity(entry({ action: 'OFFER_APPROVED', entityType: 'offer', entityLabel: '40% off shoes' }))).toBe(
      'Ravi approved offer “40% off shoes”',
    );
    expect(describeActivity(entry({ action: 'LOCALITY_CREATED', entityType: 'locality', entityLabel: 'Vidya Nagar, Hubballi' }))).toBe(
      'Ravi added area “Vidya Nagar, Hubballi”',
    );
  });

  it('adds the reason when there is one', () => {
    expect(
      describeActivity(entry({ action: 'BUSINESS_REJECTED', newValue: { status: 'REJECTED', reason: 'Photo is blurry' } })),
    ).toBe('Ravi rejected business “Shoe House”: “Photo is blurry”');
  });

  it('shows roles with friendly names, and System when nobody acted', () => {
    expect(
      describeActivity(
        entry({ action: 'ROLE_GRANTED', entityType: 'user', entityLabel: 'Asha', actor: null, newValue: { role: 'SUPER_ADMIN' } }),
      ),
    ).toBe('System gave user “Asha” the Super admin role');
  });

  it('handles items that no longer have a name and unknown actions', () => {
    expect(describeActivity(entry({ entityLabel: null }))).toBe('Ravi verified a business');
    expect(describeActivity(entry({ action: 'SOMETHING_NEW', entityType: 'widget', entityLabel: null }))).toBe(
      'Ravi something new (a widget)',
    );
  });

  it('describes report decisions (Phase 5)', () => {
    expect(describeActivity(entry({ action: 'REPORT_DISMISSED', entityType: 'report', entityLabel: 'Engage sale' }))).toBe(
      'Ravi dismissed report on “Engage sale”',
    );
    expect(
      describeActivity(
        entry({ action: 'BUSINESS_WARNED', newValue: { action: 'WARN_BUSINESS', reason: 'Show the real price' } }),
      ),
    ).toBe('Ravi warned business “Shoe House”: “Show the real price”');
    expect(describeActivity(entry({ action: 'REPORT_RESOLVED', entityType: 'report', entityLabel: null }))).toBe(
      'Ravi acted on a report',
    );
  });

  it('names settings in plain words', () => {
    expect(
      describeActivity(entry({ action: 'SYSTEM_SETTING_CHANGED', entityType: 'setting', entityLabel: 'offers.limits' })),
    ).toBe('Ravi changed setting “Offer limits”');
  });

  it('own-account actions read naturally', () => {
    expect(describeActivity(entry({ action: 'PASSWORD_CHANGED', entityType: 'user', entityId: 'u1' }))).toBe(
      'Ravi changed their password',
    );
  });
});
