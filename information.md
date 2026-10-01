# Offer Platform: complete project information

> **What this file is:** the complete description of the project in one place: the idea, the product owner's original specification, every decision taken since (and why), the final tech stack, how each module works, how the work is split into phases, what is done, and what is still needed.
>
> **Who it is for:** anyone joining the project (developer, designer, tester, investor, AI assistant).
>
> **How it relates to other files:**
> - [CLAUDE.md](CLAUDE.md) is the *working* handbook: current status, commands, operations, change log.
> - This file is the *reference*: what the product is and how it is built.
> - Deeper technical detail: [ARCHITECTURE.md](ARCHITECTURE.md), [docs/](docs/), [docs/adr/](docs/adr/README.md).
>
> **Last updated:** 2026-10-02. Update this file whenever a fact in it changes (see [CLAUDE.md](CLAUDE.md) §0).

---

## Contents

1. [The idea](#1-the-idea)
2. [Who builds it and how decisions are made](#2-who-builds-it-and-how-decisions-are-made)
3. [Original specification vs final decisions](#3-original-specification-vs-final-decisions)
4. [Final tech stack](#4-final-tech-stack)
5. [Architecture](#5-architecture)
6. [Modules, one by one](#6-modules-one-by-one)
7. [Data model](#7-data-model)
8. [Key flows](#8-key-flows)
9. [Security and privacy](#9-security-and-privacy)
10. [Phases: what is done, what is next, what each needs](#10-phases-what-is-done-what-is-next-what-each-needs)
11. [Feature checklist against the original specification](#11-feature-checklist-against-the-original-specification)
12. [Environments, hosting and accounts](#12-environments-hosting-and-accounts)
13. [Quality: testing and definition of done](#13-quality-testing-and-definition-of-done)
14. [Decisions still needed from the product owner](#14-decisions-still-needed-from-the-product-owner)
15. [Glossary](#15-glossary)

---

## 1. The idea

**One sentence:** enable local businesses to publish **verified offers for free**, and enable nearby customers to **discover those offers easily**.

### What it is (and is not)
- **It is** a local offers and business discovery platform: a marketing channel for local shops.
- **It is not** an e-commerce store. There is no ordering, no payments and no delivery in the MVP.

### The core loop
```
BUSINESS publishes an offer → PLATFORM checks and distributes it → CUSTOMER nearby discovers it → CUSTOMER visits or contacts the business
```
Nothing should complicate this loop.

### Three kinds of users
| User | What they do |
|---|---|
| **Customer** | Finds offers near them (search, categories, "near me"), views offer and shop pages, calls, WhatsApps, gets directions. Later: save, follow, share, get notifications. |
| **Business** (owner, later staff) | Registers the shop, gets verified, publishes offers (7 types), pauses or ends them. Later: sees analytics. |
| **Admin / Super admin** (Craftware team) | Verifies businesses, approves every offer, manages users, categories, cities/areas and settings, reads the activity log. |

### Market
- **First market:** **Hubballi-Dharwad**, Karnataka, India.
- **Expansion:** the code is **not** tied to Hubballi. Cities, areas, coordinates and radius are all data, so the path is other Karnataka cities, then other Indian cities, then India-wide.

### Business model
- The **MVP is completely free** for businesses and customers: registration, profiles, offers, search, saving, sharing and notifications.
- **Monetization comes later:**
  - for businesses: paid campaigns, featured or sponsored offers, subscriptions, premium analytics, multiple branches;
  - for customers: premium membership, exclusive offers, rewards.
- **Already built in:** every monetization feature has a **feature flag that defaults to `false`**. Prices will be managed by admins in the database and are never hard-coded.

### What success looks like (the product owner's metrics)
- **Users:** total, active, retention.
- **Businesses:** total, verified, active, retention.
- **Offers:** published, active.
- **Engagement:** offer views, saves and shares; business profile views; call, WhatsApp and direction taps; reports.

The goal is **liquidity and engagement of the local marketplace**, not revenue.

### Name and brand
- **The name is not final.** The specification used **"Craftfiz"**; the current preview is called **"Dodoom"**.
- **In the code:** everything uses the neutral codename **`offer-platform`**. The display name is one configuration value (`APP_DISPLAY_NAME`, ADR-0009), so renaming touches no code.

---

## 2. Who builds it and how decisions are made

- **Company:** **Craftware** builds, hosts and operates the platform. The team is 3 people.
- **Decisions:** the **product owner** decides scope and approves every phase or large feature **before** work starts.
- **How AI agents work here:** Claude Code (or any agent) works phase by phase. It explains the plan, asks when unsure, never guesses facts, tests against a real database, and updates the documentation in the same pull request.
- **Recording decisions:** structural decisions are written down as **ADRs** (Architecture Decision Records, `docs/adr/`). An accepted ADR is never edited; a new one replaces it.

**Decisions the owner made along the way** (most recent first):

| Date | Decision |
|---|---|
| 2026-10-02 | Admin screens approved and built. The activity log is shown as plain sentences. |
| 2026-10-01 | **Passwords added.** The email or phone is verified once with a code, then the user logs in with a password, and "forgot password" uses a code. This applies to phone and email accounts. Rules: 8+ characters, very common passwords refused. |
| 2026-10-01 | Keep `CLAUDE.md` always current. Every change must be recorded there (mandatory rule). |
| 2026-10-01 | Website on Vercel in the **Craftware** team at `dodoom.vercel.app`. API on one AWS EC2 server in Mumbai, with an Elastic IP. |
| 2026-10-01 | **Email code login** through Gmail (`craftwaretech@gmail.com`), plus a team-only **preview mode**. |
| 2026-10-01 | One website for everything (customers, businesses, admin) with a simple UI. |
| 2026-10-01 | Search defaults: GPS **or** city/area picker; 5 km default radius (2/5/10/25); rule-based ranking. |
| 2026-09-30 | **All 7 offer types**, and **an admin approves every offer**. "Pricing set by admin" means future platform fees, managed in the database. |
| 2026-09-30 | **No identity documents.** Business verification uses a shop photo (required), an optional owner photo and a "shop number" (registration number, shop phone, door number). An admin sets "Verified" by hand. |
| 2026-09-30 | **One repository** (monorepo) that keeps its name `offer_platform_backend`. Node.js + NestJS, Drizzle ORM, PostgreSQL + PostGIS, Redis-compatible Valkey, hosted on AWS Mumbai. The SMS vendor is pending. |
| 2026-09-30 | The name and the tech stack in the original specification are **not final**: choose what is best. |

---

## 3. Original specification vs final decisions

The product owner's original specification ("Craftfiz master specification", 62 sections) is the source of truth for **what** to build. Its **tech stack and structure were explicitly marked "not final"**, so better options were chosen where there was a clear reason:

| Topic | Original specification | Final decision | Why |
|---|---|---|---|
| Repositories | `frontend/` + `backend/` folders | **One monorepo** (`apps/api`, `apps/web`, later `apps/mobile`) with pnpm + Turborepo (ADR-0010) | One place for a 3-person team; the API contract and the apps change together |
| Backend framework | Node.js + Express | **Node.js + NestJS 12** (ADR-0003) | Built-in modules, guards and dependency injection suit a modular monolith; less hand-made plumbing |
| ORM | Prisma | **Drizzle ORM** (ADR-0005) | Close to SQL, first-class PostGIS/raw SQL, no heavy engine; typed |
| Database | PostgreSQL + PostGIS | **Same** (ADR-0004) | Geo search ("near me") with GiST indexes |
| Cache / jobs | Redis | **Valkey** (open-source Redis-compatible) + **BullMQ** (ADR-0007) | Same protocol; a fully open licence |
| Frontend | React + Vite + React Router + TanStack Query | **Next.js 16** (App Router, React 19) + Tailwind CSS 4 (ADR-0014) | Offer and shop pages must be **SEO-friendly and shareable** (server rendering, OpenGraph), which Vite alone doesn't give |
| Validation | (not specified) | **Zod 4** on every endpoint | One schema validates input and documents it |
| Login | Phone OTP preferred; email/Google/Apple possible | **Phone or email code**, then **password** (ADR-0006, ADR-0015) | SMS needs a vendor + TRAI DLT (pending). Email works now; passwords reduce friction |
| Business verification | PAN, GSTIN, registration documents (configurable) | **No identity documents**: shop photo, optional owner photo, optional registration number; configurable by admins (ADR-0012) | Owner's choice: don't hold sensitive documents |
| Object storage | S3-type storage | **Server disk** in preview; **S3** before launch | Simplicity for the team preview |
| Notifications | Firebase Cloud Messaging | **Pending decision** (Phase 6) | Not needed yet |
| Maps | Google Maps Platform | **Pending decision**; today businesses enter coordinates or tap "I am at the shop" | Avoid cost and lock-in until needed |
| Hosting | (not specified) | **AWS Mumbai** for the API (ADR-0011, ADR-0013); **Vercel** for the website (ADR-0014) | Data close to users in India; free and fast for the website |
| API style | `/api/v1/`, `{success, data}` envelope | **Same**, plus stable error codes and pagination `meta` | As specified |
| Docs | `docs/*.md` list + README | **Same set** (security and roadmap are in CLAUDE.md for now), plus ADRs, `CLAUDE.md` and this file | As specified |

Everything else in the specification (statuses, server-side discount calculation, price history, moderation, audit log, feature flags, background jobs, no mock data, no deleting offers, phases 0–9, MVP success scenario) is **followed as written**.

---

## 4. Final tech stack

| Layer | Technology (version in use) | Notes |
|---|---|---|
| Runtime | **Node.js 24** (24.15+; tested on 24.21.0) | ESM throughout |
| Language | **TypeScript 6.0** | Strict mode |
| Workspace | **pnpm 12.4.2** workspaces + **Turborepo 2.11** | `apps/*`, later `packages/*` |
| API framework | **NestJS 12** (Express platform) | Global guards, run in order: rate limit → authentication → permissions |
| Validation | **Zod 4** | Via NestJS standard-schema pipe; also generates the OpenAPI docs |
| Database | **PostgreSQL 17 + PostGIS** | `geography(Point,4326)` with GiST indexes; full-text `tsvector` + `pg_trgm` for typo-tolerant search |
| ORM / migrations | **Drizzle ORM 0.45** + drizzle-kit | SQL migrations in `apps/api/database/migrations` (0000–0008) |
| Cache, rate limits, jobs | **Valkey** (Redis-compatible) + **ioredis 6** + **BullMQ 6** | Separate worker process |
| Images | **sharp 0.35** | Re-encoded to WebP, metadata (EXIF/GPS) stripped, thumbnails |
| Passwords | **Argon2id** via Node's built-in `crypto.argon2` | m=19 MiB, t=2, p=1 (OWASP) |
| Tokens | JWT HS256 access (15 min, kept in memory) + opaque refresh tokens (30 days, rotating, reuse detection) | |
| Email | **nodemailer 10** over Gmail SMTP (preview) | Console provider in development |
| SMS | Console provider only | **Vendor pending** |
| Logging | **pino** (nestjs-pino) | Coordinates, phone numbers and auth headers are masked |
| Security headers | **helmet**; website: nonce-based CSP | |
| Website | **Next.js 16**, **React 19**, **Tailwind CSS 4** | Server-rendered public pages; logged-in screens in the browser |
| Tests | **Vitest 4**, **Testcontainers** (real PostGIS + Valkey), supertest | Each integration test file gets its own database |
| Lint | **oxlint** | |
| CI | **GitHub Actions** (Ubuntu 24.04) | Lint, types, unit + integration tests, builds, OpenAPI export |
| Containers | **Docker** (multi-stage image), **Docker Compose** | Same image for API, worker and migrations |
| Web server / HTTPS | **Caddy 2** | Automatic Let's Encrypt certificates |
| Hosting | **AWS EC2** (Mumbai `ap-south-1`) for the API; **Vercel** (Mumbai `bom1`) for the website | |

---

## 5. Architecture

### Shape: a modular monolith with two processes (ADR-0002)

```
                         ┌──────────────────────── apps/web (Next.js, Vercel) ────────────────────────┐
 Customers / Businesses  │  public pages (server-rendered)   ·  login  ·  business portal  ·  admin     │
 Admins (browser)  ────▶ └──────────────────────────────────────┬─────────────────────────────────────┘
                                                                 │ HTTPS  /api/v1  (JSON, bearer token)
                         ┌───────────────────────────────────────▼─────────────────────────────────────┐
                         │ Caddy (HTTPS) ──▶ API process (NestJS)          Worker process (BullMQ)     │
                         │                    modules: auth, users, businesses,   offer start/expiry   │
                         │                    offers, discovery, …                                     │
                         │                         │                │                │                 │
                         │                    PostgreSQL + PostGIS   Valkey (cache, rate limits, jobs) │
                         └───────────────────────────────────────── one EC2 server (preview) ──────────┘
```

**Principles:**
- **API-first:** the website, and later the mobile apps, use exactly the same API. The OpenAPI contract is exported by CI.
- **Modules only talk through exported services, never each other's tables.** For example, the admin activity feed asks each module for display names through `labelsFor(ids)`.
- **The backend decides everything that matters:** permissions, prices, discount percentages and status changes. The website only hides buttons.
- **Nothing important is ever hard-deleted:** offers, businesses, audit history. Accounts are anonymized on deletion.
- **Configuration and data, not code:** brand name, cities, areas, categories, verification rules, offer limits and feature flags.

### Repository layout
```
apps/api        backend: API + worker, migrations, CLI commands, tests
apps/web        website: customers, business portal, admin
deploy/staging  preview server: Docker Compose, Caddy, setup/deploy/backup/secret scripts
docs/           guides + ADRs
CLAUDE.md       working handbook (status, operations, change log; must be kept current)
information.md  this file
ARCHITECTURE.md original architecture document (accepted 2026-09-30)
```

### API conventions
- **Base path and format:** `/api/v1`, JSON, `camelCase` fields.
- **Success envelope:** `{ "success": true, "data": …, "meta"?: pagination }`.
- **Errors:** `{ "success": false, "error": { "code", "message", "fields" }, "requestId" }`. Codes are stable, for example `VALIDATION_ERROR`, `INVALID_CREDENTIALS`, `RATE_LIMITED` (full list in [docs/api.md](docs/api.md)).
- **Pagination:** `?page&pageSize`, at most 50 per page.
- **Request IDs:** every response carries `X-Request-Id`.
- **Values:**
  - money is **integer paise** (₹1 = 100 paise);
  - times are **UTC ISO-8601** with an offset when sent;
  - IDs are **UUID v7**.

---

## 6. Modules, one by one

Each module lives in `apps/api/src/modules/<name>/` and has a schema (its tables), services (logic), controllers (endpoints) and tests. Endpoint lists are in [docs/api.md](docs/api.md).

### Foundation (not product modules)
| Part | What it does |
|---|---|
| `config/` | Validates every environment variable at start-up (Zod). **Refuses to start** with unsafe settings, e.g. console SMS or local disk storage in production, or preview mode in production. Logger setup with masking. |
| `common/` | Error type and stable error codes, response envelope, pagination, `@Public()` / permission decorators, validation pipe, phone normalization (E.164, India default), slugs. |
| `infrastructure/` | Database (Drizzle, PostGIS helpers, migrations), Valkey (rate limiter), storage (local disk; S3 later), image processing (sharp), SMS and email providers. |
| `jobs/` + `worker.ts` | Background worker. The **offer lifecycle** job runs every minute: SCHEDULED → ACTIVE at the start time; ACTIVE/PAUSED/SCHEDULED/PENDING_REVIEW → EXPIRED at the end time. |
| `cli/` | `migrate`, `seed` (roles/permissions), `grant-role` (by phone or **verified** email), `add-localities`, `export-openapi`. |

### `users`
- **What it holds:** accounts. Phone (E.164) and/or email (lower-case), name, status (ACTIVE / SUSPENDED / DELETED), `emailVerifiedAt`, `passwordHash`, last login.
- **Email rule:** an email typed into a profile is **unverified** and never used to log in or to receive a role. It becomes verified only through a code sent to it.
- **Account deletion:** erases phone, name, email and password, ends all sessions and removes roles. The row stays for history.
- **Endpoints:**
  - `GET/PATCH /users/me`;
  - admin: `GET /admin/users`, `GET /admin/users/:id`, `PATCH /admin/users/:id/status` (suspend/reactivate with a reason), `POST/DELETE /admin/users/:id/roles`.

### `access-control`
- **Roles:** `CUSTOMER`, `BUSINESS_OWNER`, `BUSINESS_STAFF`, `ADMIN`, `SUPER_ADMIN`.
- **Permissions:** `users:read`, `users:manage-status`, `roles:assign`, `audit:read`, `businesses:read|verify|manage`, `offers:read|moderate`, `categories:manage`, `locations:manage`, `settings:manage`.
- **Admin** has everything except `roles:assign` and `settings:manage`, which are **Super admin** only.
- **Rules:**
  - permissions are checked on every request by a global guard;
  - the user is reloaded each time, so a suspension takes effect immediately;
  - nobody can remove their own Super admin role.

### `auth`
- **Code login** (sign-up and login are the same flow):
  - `POST /auth/otp/request` with `{phone}` or `{email}`, then `POST /auth/otp/verify`;
  - 6-digit code, valid 5 minutes, 5 attempts;
  - 30-second resend cooldown; per-phone, per-email and per-IP hourly limits;
  - codes are stored only as an HMAC.
- **Passwords** (ADR-0015):
  - set right after the first code login;
  - login with `POST /auth/password/login`;
  - change (needs the current password; ends other sessions);
  - forgot password (code + new password; ends every session);
  - 8–128 characters, very common passwords and the user's own email/phone refused;
  - Argon2id hashing;
  - **5 wrong tries lock the account for 15 minutes**; 30 tries per IP per 15 minutes;
  - one generic error, so nobody can learn which accounts exist.
- **Sessions:**
  - access token valid 15 minutes;
  - refresh token valid 30 days, single-use and rotating; a reused token ends the whole session;
  - logout; delete account.

### `audit` and `admin-activity`
- **audit:** important actions are recorded **in the same database transaction** as the change. Each record holds who acted, the action, the item, before and after values, and the request ID. Records are never edited. Raw feed: `GET /admin/audit-logs`.
- **admin-activity:** `GET /admin/activity` returns the same records with **names filled in** (who, which business/offer/user/area…). The website turns them into sentences such as "Ravi verified business “Shoe House”: reason".

### `platform-settings`
- **What it is:** admin-editable settings stored in the database. Each has a schema and a default.
- **Current settings:**
  - `business.verification`: which items a business must provide; shop photo required by default.
  - `offers.limits`: longest offer 90 days, 5 photos per offer by default.
- **Endpoints:** `GET /admin/settings`, `PUT /admin/settings/:key`. Super admin only, and audited.

### `locations`
- **Cities:** name, state, centre point, service radius. **Localities** (areas) belong to a city.
- **Seed data:** Hubballi and Dharwad, plus starter test areas (9 + 7).
- **Endpoints:**
  - public: `GET /cities`, `GET /cities/:slug/localities`;
  - admin: create, rename, hide (`/admin/cities…`, `/admin/localities/:id`).
- **Rule:** nothing is deleted; hidden areas disappear from forms and search.

### `categories`
- **Structure:** a two-level, **database-driven** tree, seeded from the specification:
  - **Shopping:** Fashion, Footwear, Electronics, Mobile, Jewellery, Home & Furniture, Grocery;
  - **Food:** Restaurants, Cafes, Bakeries, Fast Food;
  - **Services:** Salons, Beauty, Fitness, Education, Repairs, Automotive;
  - **Experiences:** Hotels, Travel, Events, Entertainment.
- **Admins can:** create, rename, hide/show and reorder. A parent category includes its subcategories in search.

### `businesses`
- **What it holds:** profile (name, category, description, phone, WhatsApp, email, website, social links, opening hours, registration number), one primary **location** (address + PostGIS point + city/area), images, staff (owner/staff).
- **Statuses:** `PENDING → UNDER_REVIEW → VERIFIED | REJECTED`, plus `SUSPENDED` / reactivate.
- **Verification without identity documents** (ADR-0012):
  - a checklist driven by `business.verification`;
  - verification photos are **private** (owner and admins only);
  - name, phone, registration number and location **lock** once submitted, until an admin changes them.
- **Images:**
  - kinds: logo (single), gallery (up to 10), shop and owner verification photos;
  - max 8 MB, JPEG/PNG/WebP/AVIF;
  - re-encoded to WebP and metadata stripped.
- **Visibility:** public pages show **verified** businesses only.

### `offers`
- **Seven types:**
  - `PRICE_DROP`: was ₹X, now ₹Y;
  - `PERCENTAGE_OFF`: optionally "up to", a maximum discount, a minimum purchase;
  - `FLAT_AMOUNT_OFF`;
  - `BUY_X_GET_Y`;
  - `FREE_GIFT`;
  - `COMBO`;
  - `OTHER`.
- **Pricing:** money is entered in rupees and stored in paise. **The discount % is always calculated by the server**; a client never sends it.
- **Statuses:**
  - main path: `DRAFT → PENDING_REVIEW → SCHEDULED/ACTIVE → EXPIRED`;
  - from review an admin can also choose `REJECTED` or "request changes" (back to `DRAFT`);
  - the business can PAUSE / RESUME / END;
  - admins can SUSPEND / REACTIVATE.
- **Rules:**
  - **every offer is approved by an admin**;
  - only **verified** businesses can submit;
  - editing an approved offer sends it back to review;
  - limits come from `offers.limits`;
  - expired offers stay viewable (shared links say "ended") and are **never deleted**.
- **Price history:** every pricing change is recorded in `offer_price_history`.
- **The worker** starts and ends offers on time.

### `discovery`
- **Endpoints:** `GET /discover/offers` (search + filters) and `GET /discover/home` (sections: near you, recommended, new, ending soon).
- **What search understands:**
  - free text, with **typos** tolerated;
  - **Kannada** and other scripts;
  - "under 2000" (maximum price), "50% off" (minimum discount);
  - "near me", "in <area>".
- **Filters and sorts:**
  - filters: category, area, city, business, maximum price, minimum discount, ending within N hours;
  - sorts: relevance, recommended, nearest, newest, ending soon, biggest discount.
- **Near me:** PostGIS distance within 2/5/10/25 km (default 5).
- **Ranking:** **rule-based**, a weighted sum of five scores:
  - search-word match 35%;
  - distance 25%;
  - freshness 15% (halves roughly every 5 days);
  - discount 15%;
  - "ending soon" 10% (last 72 hours).

  Verification is not a factor because only verified businesses are ever shown. Engagement and customer interests will be added once Phases 5/7 produce that data. All of this lives in one file (`ranking.ts`) so it can be tuned or replaced by an ML model later.
- **Privacy:** customer coordinates are used **only for that request**; they are never stored and are masked in logs.

### `meta` and `health`
- `GET /meta` tells apps the brand name, whether this is a preview, which login methods deliver codes, the radius options and the feature flags.
- `GET /health` and `GET /health/ready` check the database and Valkey.

### The website (`apps/web`)
| Area | Pages |
|---|---|
| Customer | Home (search box, GPS/city picker, radius, sections) · Search (filters, interpretation chips, pages) · Offer page (server-rendered: photos, price, dates, terms, call/WhatsApp/directions, OpenGraph) · Business page (server-rendered: details, opening hours, gallery, live offers) |
| Account | Login (password, "log in with a code instead", "forgot password?", sign-up with a code) · Welcome step (name + password) · Account (profile, set/change password, log out, delete account) |
| Business portal | My businesses · Register a business (address, area, map coordinates or "I am at the shop now", opening hours) · Business dashboard (verification checklist, private photos, submit, logo/gallery, offers) · New offer (7 types) · Manage offer (actions, edit, photos) |
| Admin | Review queues (businesses, offers) with private photos and decisions with reasons · Users · Categories · Cities & areas · Settings (Super admin) · Activity log |

**How the website works:**
- **Security:**
  - the access token is kept in memory, and the refresh token in the browser (ADR-0014);
  - a per-request content security policy (nonce) blocks injected scripts;
  - private images are fetched with the token.
- **Brand name:** read from the API (`/meta`).

---

## 7. Data model

**Tables (PostgreSQL), grouped by module:**

| Module | Tables |
|---|---|
| users / auth | `users`, `otp_challenges`, `refresh_tokens` |
| access-control | `roles`, `permissions`, `role_permissions`, `user_roles` |
| audit | `audit_logs` |
| settings | `platform_settings` |
| locations | `cities`, `localities` |
| categories | `categories` (two levels via `parent_id`) |
| businesses | `businesses`, `business_locations` (PostGIS point), `business_images`, `business_staff` |
| offers | `offers` (search vector + trigram index), `offer_images`, `offer_price_history` |

**Planned in the specification, not built yet:**
- Phase 5: `saved_offers`, `business_followers`, `reports`, `report_actions`.
- Phases 6–7: `notifications`, `notification_preferences`, `analytics_events`.
- Future: `redemptions`, `reviews`, `rewards`, `referrals`, `campaigns`, `sponsored_listings`, `plans`, `subscriptions`, `payments` (all behind feature flags).

**Conventions:**
- UUID v7 keys; `timestamptz` in UTC; money as integer paise.
- No hard deletes for offers or businesses.
- Every schema change is a reviewed SQL migration, committed with the code (see [docs/database.md](docs/database.md)).

---

## 8. Key flows

### Sign-up and login
1. **First time:** enter an email or phone, receive a 6-digit code, enter it. The account is created (verified).
2. **Welcome step:** choose a name and a **password**.
3. **Later:** email or phone + password. A code can still be used instead.
4. **Forgot password:** a code to the email or phone, then a new password. All devices are logged out.
5. **Staying logged in:** a session lasts up to 30 days on a device and renews automatically while in use.

### Business onboarding and verification
1. A logged-in user registers a business. It starts **PENDING** and is visible only to them.
2. They upload a **shop photo** (and optionally an owner photo and a registration number), then **submit**. The business becomes **UNDER_REVIEW** and key fields lock.
3. An admin reviews the details and private photos, then **verifies** it, or **rejects** it with a reason the owner sees.
4. Once **VERIFIED**, the business appears publicly and can publish offers.

### Offer lifecycle
1. The business creates a **DRAFT** (one of 7 types, dates, terms, photos). The server calculates the discount.
2. **Submit:** automatic checks run (business verified, dates valid, within limits). The offer becomes **PENDING_REVIEW**.
3. An admin **approves** it (it becomes SCHEDULED or ACTIVE depending on the start date), **requests changes** (back to DRAFT, with a reason) or **rejects** it (with a reason).
4. While live, the business can pause, resume or end it. Editing sends it back to review.
5. The worker activates it at the start time and expires it at the end time. It stays visible as "ended".

### Customer discovery
1. Choose a location: "Use my location" (GPS, rounded, never stored) or a city.
2. The home page shows sections (near you / recommended / new / ending soon). Search understands natural phrases.
3. The offer page offers call, WhatsApp and directions (Google Maps link). The business page lists its live offers.

### The MVP success scenario (from the specification)
*Business registers → creates profile → admin verifies → creates and submits offer → admin approves → offer becomes active → customer registers → selects location → searches Fashion → finds the nearby offer → views offer → views business → saves → shares → contacts → gets directions.*
- **Working today:** every step except **save** and the share **tracking**, which are Phase 5. Sharing a link already works: each offer has its own page, with link previews.

---

## 9. Security and privacy

**Accounts and login:**
- No plaintext passwords: Argon2id.
- Login codes stored as an HMAC; refresh tokens stored as SHA-256.
- Rate limits on codes, passwords and every IP; account lockout.
- One generic login error, with equal hashing cost (no account enumeration).

**Access control:**
- Permissions checked on the server for every request.
- An unverified email never logs anyone in and never receives a role.
- Suspension applies immediately.

**Inputs and uploads:**
- Every endpoint validates input (Zod); unknown fields are refused.
- Parameterized SQL (Drizzle).
- Uploads: size and type limits, re-encoding, metadata stripped.

**Web protection:**
- HTTPS everywhere (Caddy and Vercel).
- Security headers (helmet, HSTS).
- CORS limited to the website.
- A per-request CSP on the website.
- Public images may be embedded by other sites; private images may not.

**Secrets:**
- Only in environment variables or server files that are never committed (`.env` is git-ignored; `.vercelignore` keeps them out of uploads).
- Server secrets are generated on the server.
- The Gmail password is typed into a hidden prompt.

**Privacy:**
- Customer location is used per request only and masked in logs.
- No continuous tracking.
- Account deletion erases personal data.
- Verification photos are private.
- India's DPDP rules will be reviewed in Phase 8.

**Audit:** every administrative or sensitive action is recorded and shown in the activity log.

---

## 10. Phases: what is done, what is next, what each needs

| Phase | Scope | Status | Needs / depends on |
|---|---|---|---|
| 0 | Architecture, ADRs | ✅ Done 2026-09-30 | — |
| 1 | Foundation: config, DB + PostGIS, logging, errors, code login, roles/permissions, audit, CI | ✅ Done 2026-09-30 | — |
| 2 | Businesses: registration, profile, location, verification by photo, admin management, dashboard; categories; cities/areas; settings | ✅ Done 2026-09-30 | — |
| 3 | Offers: 7 types, validation, server-side pricing, price history, admin review, editing, scheduling/expiry worker | ✅ Done 2026-09-30 | — |
| 4 | Customer discovery: search, filters, near me, ranking, home sections; email code login; preview server | ✅ Done 2026-10-01 | — |
| Web | Website for customers, businesses and admins | ✅ Done 2026-10-01, live as a preview | — |
| Auth+ | Password login, forgot password | ✅ Done 2026-10-01 | — |
| A | Admin screens: users, categories, cities & areas, settings, activity log | ✅ Done 2026-10-02 | — |
| 5 | **Engagement:** save offers, follow businesses, share tracking, call/WhatsApp/directions tracking, report an offer + admin report queue | ⏳ Next, **needs approval** | Nothing external |
| 6 | **Notifications:** inbox, email, push; events (offer approved/rejected, business verified, followed shop's new offer, saved offer ending); preferences, quiet hours | ⏳ | **Push provider decision** (FCM proposed); Phase 5 for follows/saves |
| 7 | **Analytics:** event tracking; business dashboard (views, saves, shares, taps); admin dashboard (users, businesses, offers, engagement, categories, locations) | ⏳ | Phase 5 events; a charting library choice |
| 8 | **Security audit:** OWASP ASVS L2 review, permission tests per endpoint, dependency audit, secret rotation, upload review, backup restore drill, DPDP review | ⏳ | — |
| 9 | **Production readiness:** RDS / ElastiCache / S3, a bigger or managed server, CI deploys with approval, monitoring and alarms, real domain + domain email, real SMS, httpOnly-cookie login, browser tests, legal pages, switch-over | ⏳ | **Final name + domain, SMS vendor + DLT, maps vendor, AWS budget, launch date** |
| Later | Mobile apps; phone + email on one account; map address search; Kannada interface | Not scheduled | Owner priorities |
| V2–V7 (spec) | QR redemption, reviews, branches → rewards, referrals, personalized feed → paid campaigns, sponsored listings, premium analytics → customer membership → AI recommendations and offer generation → possible e-commerce | Not before explicitly requested | Feature flags already exist (all `false`) |

The detailed plan for each pending phase (screens, server work, "done when") is in [CLAUDE.md §13 Roadmap](CLAUDE.md).

---

## 11. Feature checklist against the original specification

Legend:
- ✅ built and tested
- 🟡 partly built
- ⏳ planned (phase)
- ➖ deliberately not in the MVP

| Specification area | State |
|---|---|
| Free MVP, monetization flags off | ✅ |
| Market data not tied to Hubballi (country/state/city/area/lat/lng/radius) | ✅ |
| Customer login (codes, email, password, reset, logout, delete account) | ✅ (phone codes need the SMS vendor) |
| Customer profile: name, phone, email | ✅ |
| Customer profile: photo, interests, notification preferences | ⏳ 6 |
| Home: search, location, categories, near you, new, ending soon, recommended | ✅ |
| Home: trending, followed businesses | ⏳ 5/7 |
| Database-driven categories with admin create/edit/disable/reorder | ✅ |
| Structured search (examples in the spec), PostGIS near me, filters | ✅ |
| Location: GPS or manual city; radius; no tracking | ✅ (choosing an area and a map location: 🟡 search by area works; a map picker needs the maps vendor) |
| Offers: fields, 7 types, server-side discount, validation, statuses, auto-expiry, never deleted | ✅ |
| Offer price history | ✅ |
| Business profile, logo, photos, address, map location, contacts, social links, opening hours | ✅ |
| Business verification (configurable requirements) | ✅ (photos instead of documents, owner's choice) |
| Business statuses and "Verified ✓" badge assigned only by admins | ✅ |
| Business dashboard: status, offers by status | ✅ |
| Business dashboard: views, saves, shares | ⏳ 7 |
| Admin: users, businesses, offers, categories, settings, activity log | ✅ |
| Admin: reports, analytics, notification configuration | ⏳ 5/7/6 |
| Moderation: automated checks, approve/reject/request changes, reason shown to the business | ✅ |
| Saved offers, follow businesses | ⏳ 5 |
| Sharing: offer page links with OpenGraph previews | ✅ (share tracking ⏳ 5) |
| Contact business: call, WhatsApp, website, directions | ✅ (tap tracking ⏳ 5) |
| Report an offer + report actions | ⏳ 5 |
| Notifications and preferences | ⏳ 6 |
| Analytics events and dashboards | ⏳ 7 |
| QR redemption | ➖ V2 (flag) |
| Recommendations: rule-based ranking | ✅ (engagement signals added after Phase 5/7) |
| Audit logging | ✅ |
| Background jobs: offer start/expiry | ✅ (notifications and analytics aggregation ⏳ 6/7) |
| SEO: server-rendered offer/business pages, titles, OpenGraph | ✅ |
| SEO: sitemap, robots, structured data, `/category/:slug`, `/city/:slug` pages | ⏳ 9 (preview is set to no-index) |
| Pagination, indexes, geo indexes, image optimization | ✅ |
| Caching, CDN | 🟡 (website on Vercel's CDN; API caching ⏳ 9) |
| Unit, integration and browser tests | ✅ unit + integration; browser runs by hand (automated ⏳ 9) |
| `.env.example`, environments, Docker, Compose, CI | ✅ |
| Deploy to staging on merge | 🟡 the website deploys automatically; the API is deployed by script (⏳ 9) |
| Production deployment, backups, monitoring | 🟡 nightly backups on the preview server; production ⏳ 9 |
| Docs (`docs/*`, README) | ✅ (security and roadmap live in CLAUDE.md for now) |

---

## 12. Environments, hosting and accounts

| Environment | Where | Notes |
|---|---|---|
| Development | Each developer's machine: Docker (PostGIS + Valkey), API on :3000, website on :3001 | Codes printed to the API log; see [CLAUDE.md §5](CLAUDE.md) |
| Test | Testcontainers (throwaway PostGIS + Valkey per run) | Locally and in CI |
| **Preview / staging** | **Website:** https://dodoom.vercel.app (Vercel team Craftware, auto-deploys `main`) · **API:** https://13-235-201-166.sslip.io/api/v1 (AWS EC2 `Offer-Platform`, Mumbai, t3.micro, Elastic IP 13.235.201.166, Docker Compose + Caddy) | Team only, `noindex`, data may be reset. Email codes via Gmail; phone codes in the server log |
| Production | Not created yet | Phase 9 |

**Accounts and secrets:**
- **Owners:** the product owner holds the GitHub org `craftware-org`, the Vercel team **Craftware**, the AWS account and the Gmail sender `craftwaretech@gmail.com`.
- **Super admin:** the first one is `offerplatform0101@gmail.com`.
- **Where secrets live:**
  - the database password and JWT/OTP secrets are generated on the server and live only in the server `.env`;
  - the Gmail App Password lives only in that `.env`;
  - the SSH key is on the owner's machine.
- **Never** put a secret in git, in chat, or in this file.
- **How to operate:** deploy, logs, backups, adding admins, adding areas, changing the Gmail password: see [CLAUDE.md §6](CLAUDE.md) and [docs/deployment.md](docs/deployment.md).

---

## 13. Quality: testing and definition of done

**Tests today:**
- API: 180 unit + 131 integration tests (real PostgreSQL/PostGIS and Valkey, never mocks).
- Website: 26 unit tests.
- Lint and type-check are clean, and CI runs everything on every pull request.

**Browser runs (by hand, against a local API and database):**
- the full MVP flow (2026-10-01);
- password login (2026-10-01);
- all admin screens (2026-10-02).

**A change is done only when:**
- the tests pass, including integration tests against a real database, and CI is green;
- new screens have been tried in a browser;
- the docs, **CLAUDE.md (change log, status, roadmap)** and, if facts changed, **this file** are updated;
- it is deployed to the preview.

**Process:**
- One branch per change and a pull request.
- Merge only on green CI.
- The API is deployed before a website change that needs it.

---

## 14. Decisions still needed from the product owner

1. **SMS provider** + TRAI DLT registration, for real phone login and phone password reset.
2. **Maps provider** (Google / Ola Maps / Mapbox), for a map picker and address search.
3. **Final product name and domain.** Moving takes about 30 minutes of configuration: DNS, API settings, Vercel variable.
4. **Push notification provider** (FCM proposed), for Phase 6.
5. **Real list of areas** for Hubballi-Dharwad, replacing the starter test list.
6. **MVP launch date** and **AWS budget**, for Phase 9.
7. **Approval of Phase 5** (engagement), the next phase.

---

## 15. Glossary

| Term | Meaning |
|---|---|
| **Offer** | A deal a business publishes (7 types). The core entity. |
| **Paise** | 1/100 of a rupee. All money is stored as whole paise to avoid rounding errors. |
| **Verified business** | A business an admin has checked. Only these appear publicly and can publish offers. |
| **Review queue** | Businesses and offers waiting for an admin decision, oldest first. |
| **Code / OTP** | 6-digit one-time code sent by email or SMS to log in, sign up or reset a password. |
| **Preview mode** | The team-only server setting where phone codes go to the server log; refused in production. |
| **ADR** | Architecture Decision Record: one file per significant decision, in `docs/adr/`. |
| **PostGIS** | PostgreSQL extension for geography; powers "near me". |
| **Worker** | The background process that starts and ends offers on time (later: notifications, analytics). |
| **Feature flag** | An on/off setting for a future feature (all monetization flags are off). |
| **Audit log / activity log** | The permanent record of important actions; shown to admins as sentences. |
| **sslip.io** | Free DNS that turns an IP address into a hostname, so the preview API can have HTTPS without a domain. |
