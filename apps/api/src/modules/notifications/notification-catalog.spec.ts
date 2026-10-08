import { customerEmailNotBefore, defaultChannels } from './notification-catalog.js';

// India time = UTC + 05:30.
const ist = (iso: string) => new Date(`${iso}+05:30`);

describe('customer email quiet hours (22:00–08:00 India time)', () => {
  it('sends straight away during the day', () => {
    const now = ist('2026-10-08T14:30:00');
    expect(customerEmailNotBefore(now)).toEqual(now);
    expect(customerEmailNotBefore(ist('2026-10-08T08:00:00'))).toEqual(ist('2026-10-08T08:00:00'));
  });

  it('holds late-evening emails until 08:00 next morning', () => {
    expect(customerEmailNotBefore(ist('2026-10-08T22:00:00'))).toEqual(ist('2026-10-09T08:00:00'));
    expect(customerEmailNotBefore(ist('2026-10-08T23:59:00'))).toEqual(ist('2026-10-09T08:00:00'));
  });

  it('holds early-morning emails until 08:00 the same day', () => {
    expect(customerEmailNotBefore(ist('2026-10-09T03:15:00'))).toEqual(ist('2026-10-09T08:00:00'));
    expect(customerEmailNotBefore(ist('2026-10-09T07:59:00'))).toEqual(ist('2026-10-09T08:00:00'));
  });
});

describe('default channels', () => {
  it('emails businesses and admins, keeps customers inbox-only', () => {
    expect(defaultChannels('OFFER_APPROVED')).toEqual({ inApp: true, email: true });
    expect(defaultChannels('ADMIN_DAILY_SUMMARY')).toEqual({ inApp: true, email: true });
    expect(defaultChannels('FOLLOWED_SHOP_NEW_OFFER')).toEqual({ inApp: true, email: false });
  });
});
