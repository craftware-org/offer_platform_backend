# ADR-0014: Web app with Next.js on Vercel, calling the API directly

- **Status:** Accepted
- **Date:** 2026-10-01

## Context
The MVP needs one website covering customers (home, search, near me, offer and business pages), business owners (registration, verification photos, offers) and admins (review queues). The owner asked for a simple UI hosted free on Vercel at `dodoom.vercel.app` until the product name and domain are decided, with the code kept production-ready. The API runs on a separate host (the preview EC2 server, later a real `api.<domain>`).

## Options considered
1. **Next.js App Router, browser calls the API directly (CORS).** One small app. Public pages (offer, business) are server-rendered for search engines and link previews. Logged-in screens are client components. Cons: the refresh token must live in the browser (`localStorage`) until web and API share a parent domain.
2. **Next.js as a backend-for-frontend (route handlers proxy every API call, refresh token in an httpOnly cookie).** Better token storage. Cons: every request takes an extra hop (Vercel → Mumbai). The API would see Vercel's IPs, which breaks its per-IP rate limits and audit IPs unless it trusts Vercel as a proxy. It also adds a second server to secure.
3. **A plain single-page app (Vite).** Simplest hosting. Cons: no server rendering for shared offer links or SEO.

## Decision
Option 1:
- **Stack:** Next.js 16 (App Router) + React 19 + Tailwind CSS 4. No component library.
- **Tokens:** the access token is kept in memory only. The refresh token goes in `localStorage`, rotated on every use (the API detects reuse).
- **XSS protection:**
  - a strict per-request Content-Security-Policy: nonce-based `script-src` with `strict-dynamic`, and `connect-src` limited to the API;
  - no `dangerouslySetInnerHTML`;
  - React escaping everywhere.
- **Private images** (verification photos, owner/admin offer photos) need the bearer token, so they are fetched with it and shown from short-lived `blob:` URLs. Public images load directly from the API.
- **Configuration:** the API origin comes from `NEXT_PUBLIC_API_URL`. The display name comes from the API's `/meta` (ADR-0009), and nothing about the brand is hard-coded.
- **Hosting:** Vercel, function region `bom1` (Mumbai, next to the API).

## Consequences
- **Moving to a real domain:** when web and API move to `<domain>` and `api.<domain>`, the API can set the refresh token as an httpOnly, `SameSite=Lax` cookie on the parent domain. Only the web app's token storage changes; this is the planned hardening before public launch.
- **Dynamic rendering:** the nonce CSP makes every page render dynamically, which is acceptable at MVP traffic.
- **Images:** business-uploaded images are served by the API, not optimised by Vercel. `next/image` is not used.
