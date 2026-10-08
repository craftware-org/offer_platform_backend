import { createHmac } from 'node:crypto';

/**
 * Crawlers, link previews and scripts. Counting (views, taps, searches) skips them; a request with
 * no User-Agent at all is treated as a script too. Logged-in users are people, so callers apply
 * this to anonymous traffic only.
 */
const BOT_PATTERN =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|headless|lighthouse|pagespeed|curl|wget|python|httpclient|okhttp\/[0-3]|java\/|go-http|axios|node-fetch|undici|postman/i;

export function isLikelyBot(userAgent: string | undefined): boolean {
  return !userAgent || BOT_PATTERN.test(userAgent);
}

/**
 * A short, keyed hash of an IP address for short-lived Valkey keys (dedupe, rate limits). The IP
 * itself is never stored anywhere (ADR-0017).
 */
export function hashIp(ip: string | undefined, key: string): string {
  return createHmac('sha256', key)
    .update(ip ?? 'unknown')
    .digest('base64url')
    .slice(0, 22);
}
