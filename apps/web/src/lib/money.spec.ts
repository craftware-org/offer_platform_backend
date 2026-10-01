import { describe, expect, it } from 'vitest';
import { formatInr, paiseToRupeesInput, rupeesToPaise } from './money';
import { toOffsetIso } from './time';

describe('money', () => {
  it.each([
    ['1999', 199900],
    ['1,999.5', 199950],
    ['0.05', 5],
    [' 10 ', 1000],
  ])('rupeesToPaise(%j) = %d', (input, paise) => {
    expect(rupeesToPaise(input)).toBe(paise);
  });

  it.each(['', '1.234', '-5', '1e3', 'abc'])('rejects %j', (input) => {
    expect(rupeesToPaise(input)).toBeNull();
  });

  it('formats rupees for display and for inputs', () => {
    expect(formatInr(199900)).toBe('₹1,999');
    expect(formatInr(199950)).toBe('₹1,999.50');
    expect(paiseToRupeesInput(199950)).toBe('1999.5');
    expect(paiseToRupeesInput(199905)).toBe('1999.05');
    expect(paiseToRupeesInput(null)).toBe('');
  });
});

describe('toOffsetIso', () => {
  it('always carries an explicit offset that the API accepts', () => {
    expect(toOffsetIso(new Date('2026-10-01T09:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it('describes the same instant', () => {
    const d = new Date('2026-10-01T09:30:00Z');
    expect(new Date(toOffsetIso(d)).getTime()).toBe(d.getTime());
  });
});
