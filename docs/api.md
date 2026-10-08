# API conventions

Base path: `/api/v1`. Interactive docs are at `/api/docs` in non-production environments. The machine-readable contract (`openapi.json`) is exported by CI on every run.

## Responses

Success:

```json
{ "success": true, "data": { }, "meta": { "page": 1, "pageSize": 20, "totalItems": 42, "totalPages": 3 } }
```

`meta` appears only on paginated lists. A `204 No Content` response has no body.

Error:

```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Invalid request", "fields": { "phone": "Invalid phone number" } },
  "requestId": "01a0f1de-..."
}
```

Clients should branch on `error.code`. Codes are stable and never renamed:

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Input failed validation; see `fields` |
| `BAD_REQUEST` | 400 | Malformed request (e.g. invalid JSON) |
| `UNAUTHENTICATED` | 401 | Missing, invalid or expired access token |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh token unknown, expired, revoked or reused |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `ACCOUNT_SUSPENDED` | 403 | The account is suspended |
| `NOT_FOUND` | 404 | Resource or route does not exist |
| `CONFLICT` | 409 | Violates a uniqueness or state rule |
| `INVALID_STATUS_TRANSITION` | 409 | Action not allowed from the current status (e.g. verify a PENDING business) |
| `FIELDS_LOCKED` | 409 | Field can only be changed by an admin now; see `fields` |
| `BUSINESS_NOT_VERIFIED` | 403 / 409 | The business must be verified for this (e.g. submitting or approving an offer) |
| `PAYLOAD_TOO_LARGE` | 413 | JSON body over 100 KB or upload over 8 MB |
| `RATE_LIMITED` | 429 | Too many requests; wait `Retry-After` seconds |
| `OTP_INVALID` | 400 | Wrong, expired or already-used code |
| `OTP_ATTEMPTS_EXCEEDED` | 400 | Too many wrong codes; request a new one |
| `INVALID_CREDENTIALS` | 401 | Wrong email/phone or password (deliberately the same for unknown accounts) |
| `SERVICE_UNAVAILABLE` | 503 | A dependency (DB, Redis, SMS) is unavailable |
| `INTERNAL_ERROR` | 500 | Unexpected error (details are logged, never returned) |

## Conventions

- JSON only, except image uploads (`multipart/form-data`, field `file`) and image downloads (`image/webp`). Field names are `camelCase`. Unknown body fields are rejected.
- Timestamps are ISO-8601 in UTC.
- Money (from Phase 3) is an integer number of **paise** ([ADR-0008](adr/0008-money-and-time.md)).
- Every response carries `X-Request-Id`. A client may send its own safe id (`[A-Za-z0-9._-]{1,64}`), and it will be echoed and logged.
- Pagination: `?page=1&pageSize=20` (maximum 50) for admin lists. Feeds will use cursors (Phase 4).
- Rate limits: a global per-IP budget (default 300/min) plus stricter limits on OTP endpoints.

## Endpoints (Phase 1)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | public | Liveness |
| GET | `/health/ready` | public | Database + Redis reachability |
| POST | `/auth/otp/request` | public | Send a login code to a phone |
| POST | `/auth/otp/verify` | public | Verify code, get tokens; creates the account on first login |
| POST | `/auth/refresh` | public (refresh token) | Rotate tokens |
| POST | `/auth/logout` | public (refresh token) | End the session |
| DELETE | `/auth/account` | user | Delete own account (erases personal data) |
| GET | `/users/me` | user | Profile, roles, permissions |
| PATCH | `/users/me` | user | Update name / email |
| GET | `/admin/users` | `users:read` | Search and filter users |
| GET | `/admin/users/:id` | `users:read` | User detail |
| PATCH | `/admin/users/:id/status` | `users:manage-status` | Suspend / reactivate, with reason |
| POST | `/admin/users/:id/roles` | `roles:assign` | Grant ADMIN / SUPER_ADMIN |
| DELETE | `/admin/users/:id/roles/:role` | `roles:assign` | Revoke ADMIN / SUPER_ADMIN |
| GET | `/admin/audit-logs` | `audit:read` | Audit trail, filterable |
| GET | `/admin/activity` | `audit:read` | Audit trail with actor and item names filled in (used by the website's activity log); same filters |

## Endpoints (Phase 2): businesses, categories, locations

See [business-workflow.md](business-workflow.md) for the full flow. `:id` values are UUIDs.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/categories` | public | Active category tree |
| GET | `/cities` | public | Active cities |
| GET | `/cities/:slug/localities` | public | Active localities of a city |
| GET | `/businesses` | public | Verified businesses; `?city=&locality=&category=` (slugs), paginated |
| GET | `/businesses/:slug` | public | Verified business profile |
| GET | `/media/images/:imageId/:variant` | public | Logo/gallery image of a verified business (`full` or `thumb`) |
| POST | `/me/businesses` | user | Register a business (you become its owner) |
| GET | `/me/businesses` | user | Businesses you own or manage |
| GET / PATCH | `/me/businesses/:id` | owner/staff | View / edit (some fields lock after submission) |
| GET | `/me/businesses/:id/dashboard` | owner/staff | Status, checklist, completeness |
| POST | `/me/businesses/:id/submit` | owner/staff | Submit for verification |
| POST | `/me/businesses/:id/images?kind=` | owner/staff | Upload `LOGO`, `GALLERY`, `VERIFICATION_SHOP`, `VERIFICATION_OWNER` |
| DELETE | `/me/businesses/:id/images/:imageId` | owner/staff | Delete an image |
| GET | `/me/businesses/:id/images/:imageId/:variant` | owner/staff | Any own image, including verification photos |
| GET | `/admin/businesses` | `businesses:read` | List/search; `?status=UNDER_REVIEW` is the review queue |
| GET | `/admin/businesses/:id` | `businesses:read` | Full detail incl. private photos |
| PATCH | `/admin/businesses/:id/status` | `businesses:verify` / `businesses:manage` | `VERIFY`, `REJECT`, `SUSPEND`, `REACTIVATE` |
| PATCH | `/admin/businesses/:id` | `businesses:manage` | Edit any field (audited) |
| GET | `/admin/businesses/:id/images/:imageId/:variant` | `businesses:read` | Private verification photos |
| GET / POST / PATCH / PUT | `/admin/categories`, `/admin/categories/:id`, `/admin/categories/order` | `categories:manage` | Manage and reorder categories |
| GET / POST / PATCH | `/admin/cities…`, `/admin/localities/:id` | `locations:manage` | Manage cities and localities |
| GET / PUT | `/admin/settings`, `/admin/settings/:key` | `settings:manage` | Platform settings (e.g. verification requirements) |

## Endpoints (Phase 3): offers

See [offer-workflow.md](offer-workflow.md) for types, pricing and lifecycle, and [moderation.md](moderation.md) for the admin side. Times are ISO-8601 **with an offset** (`2026-10-01T09:00:00+05:30`).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/offers` | public | Live offers; `?city=&locality=&category=&business=` (slugs), paginated |
| GET | `/offers/:slug` | public | Offer page (ACTIVE / PAUSED / EXPIRED, with `availability`) |
| GET | `/media/offer-images/:imageId/:variant` | public | Photo of a publicly visible offer |
| POST | `/me/businesses/:businessId/offers` | owner/staff | Create a DRAFT |
| GET | `/me/businesses/:businessId/offers` | owner/staff | The business's offers, `?status=` |
| GET | `/me/businesses/:businessId/offers/summary` | owner/staff | Count per status (dashboard) |
| GET / PATCH / DELETE | `/me/offers/:id` | owner/staff | View / edit (approved offers go back to review) / delete a never-submitted draft |
| POST | `/me/offers/:id/submit`, `/withdraw`, `/pause`, `/resume`, `/end` | owner/staff | Lifecycle actions (`allowedActions` in the response says which are available) |
| GET | `/me/offers/:id/price-history` | owner/staff | Pricing changes |
| POST / DELETE / GET | `/me/offers/:id/images[/:imageId[/:variant]]` | owner/staff | Offer photos (max from `offers.limits`, default 5) |
| GET | `/admin/offers` | `offers:read` | List/search; `?status=PENDING_REVIEW` is the review queue |
| GET | `/admin/offers/:id`, `/admin/offers/:id/price-history`, `/admin/offers/:id/images/:imageId/:variant` | `offers:read` | Review details |
| PATCH | `/admin/offers/:id/status` | `offers:moderate` | `APPROVE`, `REJECT`, `REQUEST_CHANGES`, `SUSPEND`, `REACTIVATE` |

## Endpoints (Phase 4): discovery, email login, meta

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/discover/offers` | public | Search and filter live offers (see below) |
| GET | `/discover/home` | public | Home sections: `nearby`, `recommended`, `newOffers`, `endingSoon` (`?lat&lng&radiusKm&city`) |
| POST | `/auth/otp/request` | public | Now `{ "phone": … }` **or** `{ "email": … }` (exactly one) |
| POST | `/auth/otp/verify` | public | `{ phone \| email, code }` |
| GET | `/meta` | public | App name, preview flag, login methods, radius options, feature flags |
| POST | `/auth/password/login` | public | Email or phone + password ([ADR-0015](adr/0015-password-login.md)) |
| POST | `/auth/password` | user | Set the first password |
| POST | `/auth/password/change` | user | Change password (current required); ends other sessions, returns tokens |
| POST | `/auth/password/reset` | public | Forgot password: code + new password; ends every session, returns tokens |

## Endpoints (Phase 5): engagement and reports

All of these need a logged-in user. Only logged-in users' taps are counted (owner decision 2026-10-03).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST / DELETE | `/me/saved-offers` (`{offerId}`), `/me/saved-offers/:offerId` | user | Save / unsave an offer (twice is harmless; ended offers can't be saved) |
| GET | `/me/saved-offers?status=active|ended`, `/me/saved-offers/ids` | user | Saved offers (still on, or ended); ids for hearts |
| POST / DELETE | `/me/follows` (`{businessId}`), `/me/follows/:businessId` | user | Follow / unfollow a verified business |
| GET | `/me/follows`, `/me/follows/ids`, `/me/feed/following` | user | Followed businesses; live offers from them |
| POST | `/events` | user | `{type, offerId | businessId}`: `OFFER_SHARED` (offer only), `CALL_CLICKED`, `WHATSAPP_CLICKED`, `WEBSITE_CLICKED`, `DIRECTIONS_CLICKED`. The same person and target count once per 30 minutes |
| GET | `/me/businesses/:id/engagement` | owner/staff | Followers and totals (saves, shares, calls, WhatsApp, directions, website), in total and per offer |
| POST | `/reports` | user | `{offerId, reason, note?}`; one open report per person per offer, max 20 per day |
| GET | `/me/businesses/:id/warnings` | owner/staff | Warnings sent by admins (last 180 days) |
| GET | `/admin/reports?status=OPEN|RESOLVED|DISMISSED`, `/admin/reports/:id` | `reports:moderate` | Queue (open: oldest first) and detail with action history |
| PATCH | `/admin/reports/:id` | `reports:moderate` (+ `offers:moderate` / `businesses:manage`) | `{action, note}`: `DISMISS`, `WARN_BUSINESS` (note = message to the business), `SUSPEND_OFFER`, `SUSPEND_BUSINESS`. A note is required except to dismiss. Suspending closes every open report on that offer/business |

Report reasons: `OFFER_UNAVAILABLE`, `WRONG_DISCOUNT`, `MISLEADING_INFORMATION`, `BUSINESS_CLOSED`, `WRONG_LOCATION`, `OFFENSIVE_CONTENT`, `SUSPICIOUS_ACTIVITY`, `OTHER`.

### `GET /discover/offers`

| Parameter | Meaning |
|---|---|
| `q` | Free text. Understands `under 2000` (max price), `50%` / `50% off` (min discount), `near me`, `in <locality>`; English word forms ("shirt" ↔ "Shirts"), typos, and any script (Kannada) |
| `lat`, `lng` | Customer position, used **only for this request** (never stored; masked in all logs) |
| `radiusKm` | Default 5, max 25 (with `lat`/`lng`) |
| `city`, `locality`, `category`, `business` | Slugs (a parent category includes its subcategories) |
| `maxPriceRupees`, `minDiscount`, `endingWithinHours` | Explicit filters (they override what `q` implies) |
| `sort` | `relevance` (default with `q`), `recommended` (default with a location), `newest`, `nearest`, `ending_soon`, `discount` |

Each item is a public offer plus `distanceKm`. `meta.interpretation` shows how the query was understood (`text`, `maxPrice`, `minDiscount`, `locality`, `radiusKm`, `sort`, `needsLocation`). Ranking is rule-based and defined in one file (`modules/discovery/ranking.ts`).
