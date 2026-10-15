import { describe, expect, it } from 'vitest';
import { activeTab } from './navigation';

describe('activeTab', () => {
  it.each([
    ['/', '/'],
    ['/search', '/search'],
    ['/saved', '/saved'],
    ['/notifications', '/notifications'],
    ['/account', '/account'],
    ['/following', '/account'],
    ['/business/abc/insights', '/account'],
    ['/admin/users', '/account'],
    ['/offers/some-offer', null],
    ['/searching', null],
  ])('%s lights up %s', (path, tab) => {
    expect(activeTab(path)).toBe(tab);
  });
});
