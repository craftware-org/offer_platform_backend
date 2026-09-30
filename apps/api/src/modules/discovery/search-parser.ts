/**
 * Turns a free-text search into text + structured filters (spec §9):
 *   "shoes under 2000"         → text "shoes", maxPrice ₹2,000
 *   "50% off electronics"      → text "electronics", minDiscount 50
 *   "offers near me"           → no text, nearMe
 *   "fashion in Vidya Nagar"   → text "fashion", place "vidya nagar" (resolved to a locality later)
 * Rule-based on purpose; anything not recognised stays in the text query.
 */
export interface ParsedSearch {
  text: string;
  /** Paise. */
  maxPrice?: number;
  minDiscount?: number;
  nearMe: boolean;
  /** "in <place>" phrase, lower-case; the caller resolves it against known localities. */
  place?: string;
}

const PRICE =
  /\b(?:under|below|within|less than|upto|up to)\s*(?:rs\.?|inr|₹)?\s*(\d[\d,]*)\s*(?:rs|rupees|\/-)?/i;
const PERCENT = /(\d{1,2})\s*(?:%|percent)(?:\s*(?:off|discount))?/i;
const NEAR_ME = /\b(?:near\s*me|nearby|near by|around me|close to me)\b/i;
const PLACE = /\bin\s+([a-z][a-z .'-]{1,60})$/i;
/** Words that describe the platform itself rather than what is wanted. */
const FILLER = /\b(?:offers?|deals?|discounts?|sales?|shops?|stores?|best|latest|today'?s?)\b/gi;

export function parseSearch(input: string): ParsedSearch {
  let text = ` ${input.normalize('NFKC').replace(/\s+/g, ' ').trim()} `;
  const result: ParsedSearch = { text: '', nearMe: false };

  const price = text.match(PRICE);
  if (price?.[1]) {
    const rupees = Number(price[1].replace(/,/g, ''));
    if (Number.isFinite(rupees) && rupees > 0 && rupees <= 100_000_000) result.maxPrice = rupees * 100;
    text = text.replace(price[0], ' ');
  }

  const percent = text.match(PERCENT);
  if (percent?.[1]) {
    const value = Number(percent[1]);
    if (value >= 1 && value <= 99) result.minDiscount = value;
    text = text.replace(percent[0], ' ');
  }

  if (NEAR_ME.test(text)) {
    result.nearMe = true;
    text = text.replace(NEAR_ME, ' ');
  }

  const place = text.trim().match(PLACE);
  if (place?.[1]) {
    result.place = place[1].trim().toLowerCase();
    text = text.trim().replace(PLACE, ' ');
  }

  // Keep letters, combining marks (\p{M}: Kannada/Devanagari vowel signs and viramas) and digits.
  result.text = text
    .replace(FILLER, ' ')
    .replace(/[^\p{L}\p{M}\p{N}&' -]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return result;
}
