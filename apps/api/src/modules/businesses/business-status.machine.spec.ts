import { AppError } from '../../common/errors/app-error.js';
import type { BusinessStatus } from './businesses.schema.js';
import { nextBusinessStatus, type BusinessAction } from './business-status.machine.js';

const ALL: BusinessStatus[] = ['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED'];

describe('nextBusinessStatus', () => {
  it.each<[BusinessStatus, BusinessAction, boolean, BusinessStatus]>([
    ['PENDING', 'SUBMIT', false, 'UNDER_REVIEW'],
    ['REJECTED', 'SUBMIT', false, 'UNDER_REVIEW'],
    ['UNDER_REVIEW', 'VERIFY', false, 'VERIFIED'],
    ['UNDER_REVIEW', 'REJECT', false, 'REJECTED'],
    ['VERIFIED', 'SUSPEND', true, 'SUSPENDED'],
    ['PENDING', 'SUSPEND', false, 'SUSPENDED'],
    ['SUSPENDED', 'REACTIVATE', true, 'VERIFIED'],
    ['SUSPENDED', 'REACTIVATE', false, 'PENDING'],
  ])('%s --%s--> (wasVerified=%s) %s', (from, action, wasVerified, to) => {
    expect(nextBusinessStatus(from, action, { wasVerified })).toBe(to);
  });

  it.each<[BusinessAction, BusinessStatus[]]>([
    ['SUBMIT', ['UNDER_REVIEW', 'VERIFIED', 'SUSPENDED']],
    ['VERIFY', ['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED']],
    ['REJECT', ['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED']],
    ['SUSPEND', ['SUSPENDED']],
    ['REACTIVATE', ALL.filter((s) => s !== 'SUSPENDED')],
  ])('rejects %s from %j', (action, froms) => {
    for (const from of froms) {
      expect(() => nextBusinessStatus(from, action, { wasVerified: false })).toThrow(AppError);
    }
  });

  it('never lets a business verify itself without review', () => {
    expect(() => nextBusinessStatus('PENDING', 'VERIFY', { wasVerified: false })).toThrow(/Cannot verify/);
  });
});
