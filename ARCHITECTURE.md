# Architecture — Offer Platform Backend

> **Status:** ACCEPTED by product owner on 2026-09-30.
> **Working product name:** "Craftfiz" (not final). The codebase uses the neutral codename `offer-platform`; the display name is a single config value (`APP_DISPLAY_NAME`).
> Every significant decision below has a matching record in [`docs/adr/`](docs/adr/README.md) explaining *why*.

---

## 1. Purpose

The backend is the single source of truth for a local offers and business discovery platform. It serves three kinds of client over one versioned HTTP API:

| Client | Users | Location in this repo |
|---|---|---|
| Customer web (SEO public pages) | Customers, anonymous visitors | `apps/web` (live, ADR-0014) |
| Business portal | Business owners and staff | `apps/web` (`/business`) |
| Admin panel | Admins, super admins | `apps/web` (`/admin`) for the MVP; a separate `apps/admin` only if needed later |
| Mobile apps | Customers, later businesses | `apps/mobile` (later) |

The core loop: **a business publishes an offer → the platform moderates and distributes it → a nearby customer discovers it → the customer visits or contacts the business.**

---

## 2. Repository strategy ([ADR-0010](docs/adr/0010-single-repo-monorepo.md), supersedes ADR-0001)

One repository (GitHub: `craftware-org/offer_platform_backend`, name kept for history) managed with **pnpm workspaces + Turborepo**:

```
apps/api      ← backend: API, database, migrations, background worker   (this document)
apps/web      ← customer site + business portal (Next.js, SSR for SEO)
apps/admin    ← internal admin panel (deployable behind a private network)
apps/mobile   ← customer/business apps
packages/*    ← shared code, added only when a second app needs it
infra/        ← infrastructure-as-code for AWS (Phase 9)
```

Each app builds, tests and deploys independently. CI runs only what a change affects. The backend's generated **OpenAPI spec** remains the public contract, which matters most for mobile apps that can't be force-updated.

---

## 3. High-level architecture ([ADR-0002](docs/adr/0002-modular-monolith.md))

A **modular monolith**: one codebase, one deployable image, **two process types**.

```
                    ┌────────────────────────────────────────────┐
  Clients ──HTTPS──▶│  API process  (src/main.ts)                │
                    │  NestJS · /api/v1 · auth · validation      │
                    └──────┬───────────────┬──────────────┬──────┘
                           │               │ enqueue jobs │
                           ▼               ▼              ▼
                 ┌──────────────┐   ┌───────────┐  ┌──────────────────┐
                 │ PostgreSQL   │   │  Redis    │  │ Object storage   │
                 │ + PostGIS    │   │ cache,    │  │ (S3-compatible)  │
                 │ (source of   │   │ rate lim, │  │ images           │
                 │  truth)      │   │ job queue │  └──────────────────┘
                 └──────▲───────┘   └─────┬─────┘
                        │                 │ consume jobs
                    ┌───┴─────────────────▼──────────────────────┐
                    │  Worker process (src/worker.ts)            │
                    │  offer expiry/activation · notifications · │
                    │  analytics rollups · cleanup               │
                    └──────────────┬─────────────────────────────┘
                                   ▼
                     External: SMS/OTP provider · Push (FCM) · Geocoding
```

- **API process** is stateless and scales horizontally.
- **Worker process** runs the same code with a different entrypoint. It handles scheduled and asynchronous work, so offer expiry never depends on a client being online.
- All external providers (SMS, push, storage, geocoding) sit behind **interfaces** in `src/infrastructure/`. The vendor can be chosen or changed later without touching business logic.

---

## 4. Technology stack

| Concern | Choice | ADR |
|---|---|---|
| Runtime | Node.js 24 LTS (≥ 24.15), TypeScript 6 (strict, ES modules) | 0003 |
| Framework | NestJS 12 (Express adapter) | 0003 |
| Database | PostgreSQL 17 + PostGIS 3.5 | 0004 |
| DB access / migrations | Drizzle ORM 0.45 + drizzle-kit (SQL migrations committed to git) | 0005 |
| Validation + API docs | Zod 4 schemas via NestJS 12's built-in Standard Schema support → validation **and** OpenAPI | 0003 |
| Auth | Phone OTP → short-lived JWT access token + rotating refresh token | 0006 |
| Cache / rate limiting / queues | Redis protocol: **Valkey 8** locally (the engine AWS ElastiCache offers); BullMQ from Phase 3 | 0007 |
| Object storage | S3-compatible API; S3 in production. Local option decided in Phase 2 (uploads) | — |
| Logging | Pino (structured JSON logs, request IDs, PII redaction) | — |
| Testing | Vitest (unit), Testcontainers (integration against real Postgres/PostGIS/Redis), Supertest (HTTP) | — |
| Package manager | pnpm | — |
| Containers | Docker, docker compose for local development | — |
| CI | GitHub Actions | — |

| Monorepo tooling | pnpm workspaces + Turborepo | 0010 |
| Hosting | AWS `ap-south-1` (Mumbai) | 0011 |

**Still open (does not block Phase 1):** SMS/OTP vendor, maps/geocoding vendor, push provider confirmation. See §14.

---

## 5. Source layout

```
<repo root>/
├── apps/api/                      # ← the backend; everything below lives here unless noted
├── docs/                          # (repo root) architecture, ADRs, guides
├── docker-compose.yml             # (repo root) local Postgres/PostGIS, Redis, MinIO
├── .github/workflows/             # (repo root) CI for all apps
├── pnpm-workspace.yaml, turbo.json, package.json   # (repo root) workspace config

apps/api/
├── src/
│   ├── main.ts                    # API entrypoint
│   ├── worker.ts                  # background worker entrypoint
│   ├── app.module.ts              # composes modules for the API
│   ├── worker.module.ts           # composes modules for the worker
│   │
│   ├── config/                    # env schema (Zod), typed config, feature flags
│   ├── common/                    # cross-cutting, no business logic:
│   │   ├── errors/                #   error codes, AppError, global exception filter
│   │   ├── http/                  #   response envelope, pagination, request-id
│   │   ├── auth/                  #   guards, @CurrentUser, @RequirePermission
│   │   └── validation/            #   Zod pipe
│   ├── infrastructure/            # adapters to the outside world (swappable):
│   │   ├── database/              #   Drizzle client, schema index, PostGIS types, transactions
│   │   ├── redis/
│   │   ├── queue/                 #   BullMQ setup
│   │   ├── storage/               #   StorageProvider interface + S3 implementation
│   │   ├── sms/                   #   SmsProvider interface + implementations
│   │   └── push/                  #   PushProvider interface + FCM implementation
│   │
│   └── modules/                   # business domains (one folder each)
│       ├── auth/                  # OTP, sessions, tokens
│       ├── users/                 # profiles, preferences, account deletion
│       ├── access-control/        # roles, permissions, user_roles
│       ├── businesses/            # registration, profile, locations, documents, staff, verification
│       ├── categories/            # category tree (admin-managed, DB-driven)
│       ├── locations/             # countries/states/cities/localities reference data
│       ├── offers/                # offers, images, price history, lifecycle, moderation
│       ├── discovery/             # search, nearby, feeds (trending/new/expiring), ranking
│       ├── engagement/            # saved offers, follows, contact-click tracking
│       ├── reports/               # customer reports + admin report actions
│       ├── notifications/         # notification records, preferences, dispatch
│       ├── analytics/             # event ingestion + aggregates
│       ├── audit/                 # audit_logs
│       └── platform-settings/     # runtime settings and feature-flag admin
│
├── database/
│   ├── migrations/                # generated + hand-written SQL (PostGIS, triggers, indexes)
│   └── seeds/                     # reference data only (roles, permissions, categories, locations)
├── test/
│   ├── integration/               # per-module API tests against real DB (Testcontainers)
│   ├── e2e/                       # full business → admin → customer journeys
│   └── helpers/                   # factories, auth helpers, test app bootstrap
├── scripts/                       # dev utilities (generate openapi, …)
├── Dockerfile                     # one image, two commands: api | worker
├── .env.example
└── package.json
```

### Inside a module

```
modules/offers/
├── offers.module.ts
├── offers.schema.ts               # Drizzle table definitions owned by this module
├── offers.repository.ts           # all SQL for this module lives here
├── offers.service.ts              # business rules (validation, pricing, lifecycle)
├── offer-status.machine.ts        # allowed status transitions (pure, unit-tested)
├── pricing.ts                     # discount calculation (pure, unit-tested)
├── controllers/
│   ├── offers.public.controller.ts    # GET /offers, GET /offers/:idOrSlug
│   ├── offers.business.controller.ts  # business owner/staff endpoints
│   └── offers.admin.controller.ts     # moderation endpoints under /admin
├── dto/                           # Zod request/response schemas
├── jobs/                          # offer expiry/activation processors
└── *.spec.ts                      # unit tests next to the code
```

**Why admin endpoints live inside each domain module** instead of one big `admin` module: the rules for "approve an offer" belong with the rest of the offer rules. A central admin module would either duplicate logic or reach into other modules' internals. Admin endpoints are still grouped under the `/api/v1/admin/*` URL prefix and protected by admin permissions.

### Module boundary rules

1. A module talks to another module **only through that module's exported service**, never its repository or tables.
2. Only a module's own repository reads or writes its tables. (Read-heavy discovery queries are the one planned exception: `discovery` has read-only access to offer and business tables for performance, documented in ADR-0002.)
3. Cross-module side effects ("offer approved → notify followers") go through **domain events** (in-process event emitter, with work pushed to the queue). The offers module stays unaware of notifications.

---

## 6. API conventions

- Base path `/api/v1`. Breaking changes go to `/api/v2`, and v1 continues to run in parallel.
- Resource-oriented REST, JSON only, `camelCase` fields.
- **Success envelope:** `{ "success": true, "data": …, "message"?: …, "meta"?: { pagination } }`
- **Error envelope:** `{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "fields"?: {…} }, "requestId": "…" }`
- Stable, documented error codes (`VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INVALID_STATUS_TRANSITION`, …).
- **Pagination:** cursor-based for feeds and search (stable under inserts), offset-based for admin tables. Hard maximum page size of 50.
- Every request gets an `X-Request-Id` that is echoed in responses and logs.
- Public offer and business resources are addressable by **slug** for SEO URLs.
- OpenAPI is served at `/api/docs` outside production and exported to `openapi.json` in CI.

---

## 7. Data model (overview)

Full column-level design goes in `docs/database.md` in Phase 1. Key conventions:

| Convention | Decision | Why |
|---|---|---|
| Primary keys | UUID v7 | Globally unique (safe to expose, mobile-friendly), time-ordered so indexes stay efficient |
| Money | `bigint` **paise** (₹1,199.00 → `119900`), plus a `currency` column defaulting to `INR` | Floating point breaks money math ([ADR-0008](docs/adr/0008-money-and-time.md)) |
| Discount % | Computed server-side from prices, never accepted from input | Spec requirement; prevents fake discounts |
| Time | `timestamptz`, stored in UTC; clients render in the user's zone (default `Asia/Kolkata`) | |
| Location | `geography(Point, 4326)` with a GiST index | Accurate distance in metres, indexed radius search |
| Deletion | Offers and businesses are never hard-deleted. Status fields handle lifecycle, `deleted_at` handles user-initiated removal | Spec + audit/compliance |
| Enums | Postgres enums for statuses | DB-level integrity |

**Core tables (MVP):** `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `otp_challenges`, `refresh_tokens`, `businesses`, `business_locations`, `business_documents`, `business_staff`, `categories` (self-referencing tree, replaces separate `subcategories`), `countries`, `states`, `cities`, `localities`, `offers`, `offer_images`, `offer_price_history`, `offer_moderation_events`, `saved_offers`, `business_followers`, `reports`, `report_actions`, `notifications`, `notification_preferences`, `device_tokens`, `analytics_events`, `analytics_daily_aggregates`, `audit_logs`, `platform_settings`.

**Future tables (schema reserved, not built):** `redemptions`, `reviews`, `rewards`, `referrals`, `campaigns`, `sponsored_listings`, `plans`, `subscriptions`, `payments`.

**Monetization (future, product owner decision 2026-09-30):** the MVP is free. When monetization is enabled (feature flags, all `false` today), **every platform fee is set by admins in the database** (`plans`: name, price in paise, billing period, features; editable and audited). No price is ever hard-coded. Offer prices entered by businesses are unrelated to platform fees.

**Change from the original proposal:** `categories` + `subcategories` become **one self-referencing `categories` table** (`parent_id`). It supports the same admin features (create, edit, disable, reorder, sub-levels) with one set of APIs, and a third level can be added later without a migration.

---

## 8. Key domain rules

### 8.1 Offer lifecycle

```
DRAFT ──submit──▶ PENDING_REVIEW ──approve──▶ SCHEDULED ──(start_at reached)──▶ ACTIVE ──(expires_at reached)──▶ EXPIRED
  ▲                  │    │                     (approve when start_at ≤ now ─────────▶ ACTIVE)
  │                  │    └──reject──▶ REJECTED (rejection_reason stored)
  └─ request_changes ┘
ACTIVE ⇄ PAUSED (business)        any live state ──admin──▶ SUSPENDED
```

- `APPROVED` from the original proposal is modelled as an **event** in `offer_moderation_events`, not a resting status. An approved offer immediately becomes `SCHEDULED` or `ACTIVE`, which avoids an ambiguous "approved but neither" state.
- `REQUEST_CHANGES` returns the offer to `DRAFT` with the admin's notes attached.
- Transitions are enforced by a single state machine (`offer-status.machine.ts`). Invalid transitions return `INVALID_STATUS_TRANSITION`.
- Editing price, dates or content of a live offer sends it back through review. Every price change writes `offer_price_history`.
- **Expiry is enforced two ways:** (1) a worker job flips `ACTIVE → EXPIRED` every minute, and (2) every discovery query also filters `expires_at > now()`, so an offer is never shown past expiry even if the job is delayed.
- Only businesses with status `VERIFIED` can submit offers for review.

### 8.2 Business lifecycle

`PENDING → UNDER_REVIEW → VERIFIED | REJECTED`, and `VERIFIED ⇄ SUSPENDED` by admin. The verified badge is set **only** by admin action and always audited. Required verification documents are configurable per category through `platform_settings`, so not every document is required for every business.

### 8.3 Authorization

- Roles: `CUSTOMER`, `BUSINESS_OWNER`, `BUSINESS_STAFF`, `ADMIN`, `SUPER_ADMIN`.
- Endpoints check **permissions** (e.g. `offer:moderate`), not role names, so roles can be reshaped without code changes.
- Business-scoped actions also check **ownership**: a business owner or staff member can act only on businesses they belong to (`business_staff`).
- All checks happen in the backend. Frontend checks are cosmetic only.

---

## 9. Discovery, search and ranking

- **Nearby:** `ST_DWithin(location, :point, :radius_m)` on the GiST index, radius capped (default 5 km, max 50 km).
- **Text search:** Postgres full-text search (`tsvector`, generated column, GIN index) plus `pg_trgm` for typo tolerance ("restarant" still finds restaurants).
- **Structured parsing (MVP, rule-based):** extract obvious filters such as "under 2000" → max price, "50%" → min discount, "near me" → use location, "in <locality>" → locality filter. Everything else is free text.
- **Ranking (rule-based, weights in config):** distance + freshness + engagement + category preference + expiry proximity + verified business. The formula lives in one function so ML can replace it later.
- **Later:** OpenSearch if Postgres search becomes a bottleneck. The `discovery` module's interface stays the same.

---

## 10. Authentication ([ADR-0006](docs/adr/0006-auth-phone-otp-and-tokens.md))

1. `POST /auth/otp/request` with a phone number (E.164). The server generates a 6-digit code, stores **only its hash** with a 5-minute expiry, and sends it through the SMS provider.
2. `POST /auth/otp/verify` with the phone number and code. The challenge allows at most 5 attempts. On success the server returns an access token and a refresh token.
3. **Access token:** JWT, 15-minute lifetime, sent as a Bearer header (works identically for web and mobile).
4. **Refresh token:** random opaque value, stored **hashed** in the DB, rotated on every use. Reusing an old refresh token revokes the whole session family, which detects token theft.
5. Rate limits (Redis): per phone number, per IP, and per device for OTP requests.
6. Logout revokes the refresh token. Account deletion anonymises personal data and revokes all sessions.
7. **Development:** a `console` SMS provider logs OTPs locally. It refuses to start when `NODE_ENV=production`.

Email and Google/Apple sign-in can be added later as extra verification methods that issue the same tokens.

---

## 11. Background jobs (worker)

| Job | Schedule | Notes |
|---|---|---|
| Activate scheduled offers | every minute | `SCHEDULED → ACTIVE` when `start_at ≤ now` |
| Expire offers | every minute | `ACTIVE/PAUSED → EXPIRED` when `expires_at ≤ now` |
| Dispatch notifications | on event | respects preferences, quiet hours, frequency caps |
| "Expiring soon" notifications | hourly | for saved offers |
| Analytics aggregation | hourly / daily | raw events → daily per-offer/per-business counts |
| Cleanup | daily | expired OTP challenges, old refresh tokens, orphaned uploads |

Jobs are **idempotent**: running one twice has no extra effect. Status flips use conditional updates (`WHERE status = 'ACTIVE' AND expires_at <= now()`), so a retry or overlap can't corrupt state.

---

## 12. Security and privacy baseline

- Helmet security headers, strict CORS allow-list, and HTTPS enforced at the load balancer in production.
- Zod validation on every input. Unknown fields are rejected.
- Parameterised SQL only (Drizzle). Raw SQL goes through tagged templates and is never built by string concatenation.
- Rate limiting: global per IP, stricter limits on auth and report endpoints.
- **Uploads:** clients get short-lived presigned URLs. The server then verifies the real file type from magic bytes (not the extension), size and dimensions, strips EXIF metadata including GPS data, and generates resized variants.
- Secrets only in environment variables. `.env` is git-ignored. Config is validated at startup and the app refuses to boot if values are missing or insecure.
- Audit log for every admin action (`admin_id`, action, entity, old value, new value, time).
- **Privacy (India's DPDP Act, 2023):** collect the minimum data. Store no continuous location. Customer location is used per request and only a coarse saved preference is kept. Analytics events store no raw GPS. Account deletion is supported.
- Logs redact phone numbers, tokens and OTPs.

---

## 13. Environments and delivery

| Env | Database | Notes |
|---|---|---|
| development | Docker Postgres/PostGIS, Redis, MinIO | seeded reference data, console SMS |
| test | Testcontainers, a throwaway DB per test run | CI + local |
| staging | Managed Postgres (separate instance) | real providers in sandbox/test mode |
| production | Managed Postgres with point-in-time backups | deploy is a manual approval step |

**CI on each pull request:** lint → type-check → unit tests → integration tests → build → export OpenAPI.
**On merge to main:** build image → deploy to staging. Production deploys are manual and gated.
Migrations run as a separate release step, never automatically on app boot in production.

---

## 14. Open decisions (answers from product owner pending)

| # | Decision | Blocks |
|---|---|---|
| 1 | ~~Cloud provider~~ → **AWS Mumbai** (ADR-0011). Specific compute service decided in Phase 9 | Phase 9 |
| 2 | SMS/OTP vendor + TRAI DLT registration status — **pending, owner discussing** | real OTP delivery (Phase 1 uses console provider) |
| 3 | Maps/geocoding vendor (Google, Ola Maps, Mapbox/OSM) | address → coordinates (Phase 2) |
| 4 | Push: FCM confirmed? | Mobile apps (Phase 6 shipped inbox + email only) |
| 5 | Final product name / domain (preview: "Dodoom" at dodoom.vercel.app + sslip.io API) | public URLs, SEO (before launch) |
| 6 | MVP target date (team: 3 people at Craftware, who build, host and operate) | planning only |

---

## 15. Delivery phases

| Phase | Scope | Exit criteria |
|---|---|---|
| 0 | This document + ADRs | ✅ Approved 2026-09-30 |
| 1 | Foundation: project, config, Docker (local services), DB + PostGIS, migrations, logging, errors, auth (OTP), roles/permissions, audit, CI | ✅ Done 2026-09-30: 22 unit + 38 integration tests green against real PostGIS + Valkey |
| 2 | Businesses: registration, profile, location (PostGIS), photo-based verification ([ADR-0012](docs/adr/0012-business-verification-without-identity-documents.md)), admin management, dashboard API; categories, cities/localities and platform settings (moved up from Phase 4) | ✅ Done 2026-09-30: Business → Admin → Verified tested end to end (75 unit + 68 integration tests) |
| 3 | Offers: 7 types, create/edit, validation, server-side pricing, price history, moderation (every offer), scheduling, expiry worker (BullMQ) | ✅ Done 2026-09-30: full lifecycle tested, including the real worker (145 unit + 100 integration tests) |
| 4 | Discovery: full-text + trigram search (any script), query understanding, near me (PostGIS), filters, rule-based ranking, home sections; plus email OTP login, /meta, preview mode and staging deployment | ✅ Done 2026-10-01 (167 unit + 119 integration tests); preview API live on EC2 |
| Web | Next.js website (`apps/web`): customer pages, login, business portal, admin review ([ADR-0014](docs/adr/0014-web-app-nextjs-on-vercel.md)) | ✅ Done 2026-10-01: browser end-to-end run of the full MVP flow; live at https://dodoom.vercel.app |
| 5 | Engagement: save, follow, share tracking, contact clicks, reports | ✅ Done 2026-10-08 (180 unit + 141 integration tests) |
| 6 | Notifications: infrastructure, preferences, dispatch ([ADR-0016](docs/adr/0016-notifications-domain-events-and-email-outbox.md): in-app inbox + email; push later with the mobile apps) | ✅ Done 2026-10-08 (184 unit + 149 integration tests) |
| 7 | Analytics: ingestion, aggregates, business + admin analytics ([ADR-0017](docs/adr/0017-analytics-counting-rollups-and-charts.md)) | ✅ Done 2026-10-09 (190 unit + 155 integration tests) |
| 8 | Security audit ([report](docs/security-audit-2026-10-09.md), [ADR-0018](docs/adr/0018-admin-two-step-login-with-authenticator-app.md)) | ✅ Done 2026-10-09 (194 unit + 163 integration tests); findings fixed or accepted by the owner |
| 9 | Production readiness: production Docker image, AWS infrastructure, staging deploy pipeline, backups, monitoring, deployment docs | MVP success scenario passes against a real DB |
