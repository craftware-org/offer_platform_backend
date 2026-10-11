import { WEB_URL } from './env';

/** Public web page of an offer: what people share (it has link previews and opens the app if installed). */
export const offerWebUrl = (slug: string) => `${WEB_URL}/offers/${encodeURIComponent(slug)}`;
export const businessWebUrl = (slug: string) => `${WEB_URL}/businesses/${encodeURIComponent(slug)}`;

/** App screens use the same paths as the website, so links in notifications work as they are. */
const APP_PATHS = [
  /^\/$/,
  /^\/offers\/[^/]+$/,
  /^\/businesses\/[^/]+$/,
  /^\/business$/,
  /^\/business\/new$/,
  /^\/business\/offers\/[^/]+$/,
  /^\/business\/offers\/[^/]+\/edit$/,
  /^\/business\/[^/]+$/,
  /^\/business\/[^/]+\/edit$/,
  /^\/business\/[^/]+\/insights$/,
  /^\/business\/[^/]+\/offers\/new$/,
  /^\/report\/[^/]+$/,
  /^\/saved$/,
  /^\/following$/,
  /^\/notifications$/,
  /^\/notification-settings$/,
  /^\/account$/,
  /^\/search$/,
];

/**
 * Where a website-style link (e.g. a notification's "/business/offers/<id>") goes: an app screen, or
 * the website for pages the app does not have (admin screens).
 */
export function resolveLink(link: string): { kind: 'app'; path: string } | { kind: 'web'; url: string } {
  const path = link.split(/[?#]/)[0] ?? link;
  if (APP_PATHS.some((re) => re.test(path))) return { kind: 'app', path: link };
  return { kind: 'web', url: link.startsWith('/') ? `${WEB_URL}${link}` : link };
}

/** Digits only, for wa.me links ("+91 98450 12345" → "919845012345"). */
export const whatsappDigits = (n: string | null | undefined) => (n ? n.replace(/[^\d]/g, '') : '');

export const directionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
