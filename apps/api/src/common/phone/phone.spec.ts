import { AppError } from '../errors/app-error.js';
import { normalizePhone } from './phone.js';

describe('normalizePhone', () => {
  it.each([
    ['9845012345', '+919845012345'],
    ['98450 12345', '+919845012345'],
    ['+91 98450-12345', '+919845012345'],
    ['09845012345', '+919845012345'],
  ])('normalizes %s to E.164', (input, expected) => {
    expect(normalizePhone(input, 'IN')).toBe(expected);
  });

  it.each(['12345', 'abcdefghij', '+91 12345'])('rejects %s', (input) => {
    expect(() => normalizePhone(input, 'IN')).toThrow(AppError);
  });

  it('reports the error on the phone field', () => {
    try {
      normalizePhone('123', 'IN');
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).fields).toEqual({ phone: 'Invalid phone number' });
    }
  });
});
