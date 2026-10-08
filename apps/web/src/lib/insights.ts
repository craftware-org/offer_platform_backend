/** Phase 7 analytics shapes (API: /me/businesses/:id/insights and /admin/insights) and helpers. */

export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];

export interface Totals {
  offerViews: number;
  shopViews: number;
  saves: number;
  shares: number;
  calls: number;
  whatsapp: number;
  website: number;
  directions: number;
  follows: number;
}

export interface DayPoint {
  day: string;
  views: number;
  taps: number;
}

export interface OfferPerformance {
  offerId: string;
  title: string;
  slug: string;
  status: string;
  views: number;
  saves: number;
  shares: number;
  contactTaps: number;
  tapsPer100Views: number | null;
}

export interface BusinessInsights {
  days: RangeDays;
  range: { from: string; to: string };
  totals: Totals;
  previous: Totals;
  daily: DayPoint[];
  offers: OfferPerformance[];
  bestOfferId: string | null;
}

export interface Series {
  day: string;
  value: number;
}

export interface LabelCount {
  label: string;
  value: number;
}

export interface Queue {
  waiting: number;
  oldestSince: string | null;
}

export interface AdminInsights {
  days: RangeDays;
  range: { from: string; to: string };
  users: { total: number; active7: number; active30: number; signups: Series[]; logins: Series[] };
  businesses: { byStatus: { status: string; value: number }[]; new: Series[] };
  offers: { liveNow: number; published: Series[]; liveByCity: LabelCount[]; liveByCategory: LabelCount[] };
  queues: { businesses: Queue; offers: Queue; reports: Queue };
  engagement: {
    totals: { views: number; saves: number; taps: number; follows: number };
    previous: { views: number; saves: number; taps: number; follows: number };
    daily: DayPoint[];
  };
  topOffers: { offerId: string; title: string; slug: string; business: string; views: number; taps: number }[];
  topBusinesses: { businessId: string; name: string; slug: string; views: number; taps: number }[];
  searches: {
    total: number;
    top: { query: string; count: number; avgResults: number }[];
    noResults: { query: string; count: number }[];
  };
}

/** Page views: offer pages plus the shop page. */
export const totalViews = (t: Totals) => t.offerViews + t.shopViews;
/** Ways of getting in touch. */
export const contactTaps = (t: Totals) => t.calls + t.whatsapp + t.website + t.directions;

/**
 * "+25%", "−40%", "new" (nothing before) or "" (nothing either time), comparing with the previous
 * period of the same length.
 */
export function changeLabel(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? '' : 'new';
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return '±0%';
  return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

/** '2026-10-08' → '8 Oct' (dates are India-time calendar days from the API). */
export function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** A "nice" top value for a chart axis: 1, 2, 5 × 10ⁿ at or above the largest value. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 5, 10]) if (step * exp >= max) return step * exp;
  return 10 * exp;
}

/** How long something has waited, in words: "3 days", "5 hours", "just now". */
export function waitedFor(since: string | null, now = new Date()): string {
  if (!since) return '';
  const hours = Math.floor((now.getTime() - new Date(since).getTime()) / 3_600_000);
  if (hours >= 48) return `${Math.floor(hours / 24)} days`;
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return 'just now';
}
