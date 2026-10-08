import { isLikelyBot } from '../../common/http/visitors.js';
import { addDays, dayStart, daysBetween, istDay, liveFrom, rangeEndingToday } from './analytics-time.js';
import { normalizeSearch } from './search-normalize.js';

const ist = (iso: string) => new Date(`${iso}+05:30`);

describe('analytics days (India time)', () => {
  it('puts late-evening UTC times on the next India day', () => {
    expect(istDay(new Date('2026-10-08T18:29:59Z'))).toBe('2026-10-08'); // 23:59:59 IST
    expect(istDay(new Date('2026-10-08T18:30:00Z'))).toBe('2026-10-09'); // 00:00 IST
    expect(dayStart('2026-10-09').toISOString()).toBe('2026-10-08T18:30:00.000Z');
  });

  it('moves across months and lists every day of a range', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('builds "last N days" including today, and the period before it', () => {
    const { current, previous } = rangeEndingToday(7, ist('2026-10-08T10:00:00'));
    expect(current).toEqual({ from: '2026-10-02', to: '2026-10-08' });
    expect(previous).toEqual({ from: '2026-09-25', to: '2026-10-01' });
    expect(liveFrom(ist('2026-10-08T00:10:00'))).toBe('2026-10-07');
  });
});

describe('search normalization', () => {
  it('lower-cases, trims and keeps other scripts', () => {
    expect(normalizeSearch('  Running   SHOES under 2000 ')).toBe('running shoes under 2000');
    expect(normalizeSearch('ಬಟ್ಟೆ ಅಂಗಡಿ')).toBe('ಬಟ್ಟೆ ಅಂಗಡಿ');
  });

  it('masks phone numbers and email addresses, and drops empty input', () => {
    expect(normalizeSearch('call 98450 12345 shoes')).toBe('call # shoes');
    expect(normalizeSearch('9845012345')).toBeNull(); // only a number: nothing worth counting
    expect(normalizeSearch('shoes for ravi@example.com')).toBe('shoes for #');
    expect(normalizeSearch('a')).toBeNull();
    expect(normalizeSearch('   ')).toBeNull();
    expect(normalizeSearch('x'.repeat(300))).toHaveLength(100);
  });
});

describe('bot detection', () => {
  it('skips crawlers, link previews, scripts and missing user agents', () => {
    expect(isLikelyBot(undefined)).toBe(true);
    expect(isLikelyBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(isLikelyBot('WhatsApp/2.23.20.0 A')).toBe(true);
    expect(isLikelyBot('curl/8.4.0')).toBe(true);
    expect(isLikelyBot('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36')).toBe(false);
  });
});
