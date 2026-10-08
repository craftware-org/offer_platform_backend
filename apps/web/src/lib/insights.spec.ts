import { describe, expect, it } from 'vitest';
import { changeLabel, niceMax, shortDay, waitedFor } from './insights';

describe('analytics helpers', () => {
  it('describes the change versus the previous period', () => {
    expect(changeLabel(15, 10)).toBe('+50%');
    expect(changeLabel(6, 10)).toBe('−40%');
    expect(changeLabel(10, 10)).toBe('±0%');
    expect(changeLabel(3, 0)).toBe('new');
    expect(changeLabel(0, 0)).toBe('');
  });

  it('rounds chart tops to 1, 2 or 5 × 10ⁿ', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(13)).toBe(20);
    expect(niceMax(40)).toBe(50);
    expect(niceMax(500)).toBe(500);
  });

  it('formats India-time days and waiting times', () => {
    expect(shortDay('2026-10-08')).toBe('8 Oct');
    const now = new Date('2026-10-08T12:00:00Z');
    expect(waitedFor('2026-10-05T12:00:00Z', now)).toBe('3 days');
    expect(waitedFor('2026-10-08T07:00:00Z', now)).toBe('5 hours');
    expect(waitedFor('2026-10-08T11:50:00Z', now)).toBe('just now');
    expect(waitedFor(null, now)).toBe('');
  });
});
