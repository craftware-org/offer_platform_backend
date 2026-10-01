/**
 * Rule-based ranking (spec §33), in one place so it can be tuned or replaced by ML later.
 * Every component is scaled to 0..1 in SQL; the score is their weighted sum.
 *
 *   text        how well the offer matches the search words (only when there is a query)
 *   distance    1 at the customer's location, 0 at the edge of the search radius
 *   freshness   1 when just approved, halving roughly every 5 days
 *   endingSoon  rises from 0 to 1 over the last 72 hours of an offer
 *   discount    the discount percentage / 100 (0 for offers without one)
 *
 * Not yet included (no data until later phases): engagement (views/saves, Phase 5/7) and
 * category preference (customer interests). Verification is not a factor: only verified
 * businesses are ever shown.
 */
export const RANKING_WEIGHTS = {
  text: 0.35,
  distance: 0.25,
  freshness: 0.15,
  endingSoon: 0.1,
  discount: 0.15,
} as const;

/** Freshness decay constant in seconds (e^(-t/τ); τ = 7 days ≈ half-life of 5 days). */
export const FRESHNESS_TAU_SECONDS = 7 * 86_400;
/** Window in which "ending soon" starts to lift an offer. */
export const ENDING_SOON_WINDOW_HOURS = 72;

export const DEFAULT_RADIUS_KM = 5;
export const MAX_RADIUS_KM = 25;
