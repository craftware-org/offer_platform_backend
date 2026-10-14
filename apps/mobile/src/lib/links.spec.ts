import { describe, expect, it } from 'vitest';
import { resolveLink, whatsappDigits } from './links';

describe('resolveLink', () => {
  it('keeps app screens in the app', () => {
    expect(resolveLink('/offers/diwali-sale-abc')).toEqual({ kind: 'app', path: '/offers/diwali-sale-abc' });
    expect(resolveLink('/business/offers/0190-1')).toEqual({ kind: 'app', path: '/business/offers/0190-1' });
    expect(resolveLink('/business/0190-1')).toEqual({ kind: 'app', path: '/business/0190-1' });
    expect(resolveLink('/business/0190-1/insights')).toEqual({ kind: 'app', path: '/business/0190-1/insights' });
  });

  it('knows every screen a login can return to', () => {
    for (const path of [
      '/business/0190-1/edit',
      '/business/offers/0190-1/edit',
      '/business/0190-1/offers/new',
      '/report/0190-1',
      '/notification-settings',
      '/search?q=shoes',
    ]) {
      expect(resolveLink(path).kind).toBe('app');
    }
  });

  it('opens other pages (admin) on the website', () => {
    const r = resolveLink('/admin');
    expect(r.kind).toBe('web');
    expect(r.kind === 'web' && r.url.endsWith('/admin')).toBe(true);
  });
});

describe('whatsappDigits', () => {
  it('keeps digits only', () => {
    expect(whatsappDigits('+91 98450-12345')).toBe('919845012345');
    expect(whatsappDigits(null)).toBe('');
  });
});
