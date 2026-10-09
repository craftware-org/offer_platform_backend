# CLAUDE.md: project handbook (read this first)

This is the single entry point for **teammates and AI assistants** (Claude Code loads this file automatically). It says what the project is, what is done, what is running where, what is left, and the rules for working here. Deeper detail lives in the linked docs.

> **Last updated: 2026-10-09.**

> [!IMPORTANT]
> **MANDATORY RULE: keep this file current.** Anyone who changes this project (a teammate, Claude, or any other AI agent) **must update this file in the same pull request**. A pull request that changes code, configuration, infrastructure or decisions without updating CLAUDE.md is not finished and must not be merged. Write it for the next person, who has none of your context. Exactly what to update: §0 below.

---

## 0. How to keep this file current (required for every change)

In **every** pull request, before asking for merge:

1. **Add an entry to §14 Change log**, at the top, using the format given there:
   - date, PR number and author (person or agent);
   - **what** changed, **why**, and **how it was verified** (tests, browser run, deploy check);
   - anything the next person must know: new env vars, migrations, manual steps, follow-ups.
2. **Update §2 Status** when a phase or feature changes state. Keep the test counts in sync with the latest run.
3. **Update §3 What is running where** if you change servers, URLs, accounts, environment variables, DNS or deploy targets. Write *where* each secret lives, never the secret itself.
4. **Update §10 What's next and §13 Roadmap:**
   - remove what you finished;
   - add what you discovered;
   - mark phases "Approved (date)" or "✅ Done (date)".
5. **Update the cheat sheet (§7), commands (§5, §6) and gotchas (§11)** if behaviour, commands or pitfalls changed.
   Also update **[information.md](information.md)** (the complete project reference) when product, stack, modules, phases or decisions change.
6. **Bump "Last updated"** at the top.

Other rules:
- Deeper docs (`docs/*.md`, ADRs) are updated too; this file links to them and does not replace them.
- When an AI agent finishes a task, its last step is this update. If something was left unfinished, say so in the change log under **Follow-ups**.

---

## 1. What we are building

- **Product:** a local offers and business discovery platform. Local shops publish **verified offers for free**, and nearby customers find them (search, "near me", categories). Core loop: *business publishes offer → admin approves → customer nearby discovers it → customer visits or contacts the shop*.
- **Company:** built, hosted and operated by **Craftware** (team of 3).
- **First market:** Hubballi-Dharwad, Karnataka, India.
- **Name:** not final. The working names were "Craftfiz" and then **"Dodoom"**, which is the current preview display name. The code always uses the neutral codename **`offer-platform`**, and the display name comes only from configuration (`APP_DISPLAY_NAME`, ADR-0009).
- **Business model:** the MVP is **free**. Future platform fees (business plans, sponsored offers etc.) will be admin-managed in the database and kept behind feature flags that default to `false`. Nothing paid is built yet.
- **Clients:**
  - **Website** (`apps/web`): customers, business portal and admin screens, all in one Next.js app. Live.
  - **Mobile apps:** planned later (`apps/mobile`); they will use the same API and its OpenAPI contract.

---

## 2. Status at a glance

| Phase | Scope | State |
|---|---|---|
| 0 | Architecture + ADRs | ✅ Done |
| 1 | Foundation: config, DB + PostGIS, logging, errors, phone-OTP auth, roles/permissions, audit, CI | ✅ Done |
| 2 | Businesses, photo-based verification (no ID documents), categories, cities/localities, image uploads, platform settings | ✅ Done |
| 3 | Offers: 7 types, server-side pricing, price history, admin review of every offer, scheduling/expiry worker | ✅ Done |
| 4 | Discovery (search, near me, filters, ranking, home sections), **email OTP login**, `/meta`, preview mode, staging server | ✅ Done |
| Web | Next.js website: customer pages, login, business portal, admin review (ADR-0014) | ✅ Done, live as a preview |
| Auth+ | **Password login** after a one-time verification code; forgot password by code (ADR-0015) | ✅ Done 2026-10-01 |
| A | **Admin screens**: users, categories, cities & areas, settings, activity log (in plain sentences) | ✅ Done 2026-10-02 |
| 5 | **Engagement**: save offers, follow businesses, share and contact-tap counts (logged-in users; everyone since Phase 7), report an offer + admin report queue, business totals and warnings | ✅ Done 2026-10-08 |
| 6 | **Notifications**: 🔔 in-app inbox + email (Gmail SMTP), per-type preferences, one-click unsubscribe, offer-ending and admin daily summary jobs. Push comes later with the mobile apps | ✅ Done 2026-10-08 |
| 7 | **Analytics**: views and taps from everyone (anonymous, deduped), search logging, nightly daily totals, business Performance page, admin Insights, weekly business summary | ✅ Done 2026-10-09 |
| 8 | **Security audit**: authenticator-app 2-step login for admins, every-route permission test, complete account deletion (owned shops closed), retention clean-up, dependency fixes, backup restore drill ([report](docs/security-audit-2026-10-09.md)) | ✅ Done 2026-10-09 |
| 9 | Production readiness: RDS/ElastiCache/S3, CI deploys, monitoring, real SMS, real domain | ⏳ Next (needs owner decisions + approval) |

**Tests (all must stay green):** API 194 unit + 163 integration tests (real PostgreSQL/PostGIS and Valkey via Testcontainers); web 30 unit tests. Lint and type-check are clean. A full browser end-to-end run of the MVP flow passed on 2026-10-01 (see §8).

**Merged pull requests:**
- #1 Phase 1
- #2 Phase 2
- #3 Phase 3
- #4 Phase 4 + staging
- #5 Website
- #6 `add-localities` CLI · #7 this handbook · #8 password login · #9 roadmap, update rule, change log · #10 admin screens · #11 information.md · #12 Phase 5 engagement · #13 Phase 6 notifications · #14 Phase 7 analytics · #15 Phase 8 security audit

---

## 3. What is running where (preview / staging)

This is a **team-only preview**: data may be reset, and search engines are told not to index it (`noindex`).

| What | Where | Notes |
|---|---|---|
| **Website** | https://dodoom.vercel.app | Vercel team **Craftware**, project `dodoom`, root `apps/web`, region `bom1` (Mumbai). **Auto-deploys every push to `main`**; other branches get preview URLs. Also reachable at `dodoom-omega.vercel.app`. |
| **API** | https://13-235-201-166.sslip.io/api/v1 | One EC2 instance (ADR-0013). Interactive docs: `/api/docs`. Health: `/api/v1/health/ready`. |
| API server | AWS `ap-south-1` (Mumbai) | Instance `Offer-Platform` (`i-0a2e864dad08c59b5`), **t3.micro + 2 GB swap**, Ubuntu 26.04, **Elastic IP 13.235.201.166**. Docker Compose runs Caddy (auto-HTTPS), API, worker, PostgreSQL/PostGIS and Valkey. App folder: `/opt/offer-platform/src/deploy/staging`. |
| Domain | `sslip.io` | Free wildcard DNS: `13-235-201-166.sslip.io` resolves to the Elastic IP. Let's Encrypt certificate by Caddy. |
| Email login codes | Gmail SMTP, sender `craftwaretech@gmail.com` | App Password stored only in the server `.env` (entered with `set-secret.sh`). |
| Phone login codes | **Not delivered yet** | No SMS vendor. In preview mode phone codes are written to the API log. |
| First super admin | `offerplatform0101@gmail.com` | Granted with `grant-role --email`. More admins: §6. |
| Areas (localities) | Starter **test** list | Hubballi: Akshay Park, Deshpande Nagar, Gokul Road, Gopankoppa, Keshwapur, Navanagar, Shirur Park, Unkal, Vidya Nagar. Dharwad: Kalyan Nagar, Malmaddi, Narayanpur, Saptapur, Sattur, Shivagiri, Vidyagiri. Replace with the real list before launch. |
| Other AWS resource | `quba-tours-prod` EC2 instance | **A different project. Never touch it.** |

**Who holds which secret (never in git, never in chat):**
- **EC2 SSH key `offer-platform.pem`:** the owner keeps it on their machine.
- **Database password, JWT and OTP secrets:** generated on the server by `setup-server.sh`; they exist only in the server `.env` (mode 600).
- **Gmail App Password:** only in the server `.env`. If it ever leaks, revoke it in the Google account and re-run `set-secret.sh`.
- **Vercel and GitHub:** accessed through the owner's accounts (Vercel team **Craftware**, GitHub org **craftware-org**).

**Left over:** an old Vercel project `dodoom` exists in the personal Vercel account `mohammed-tousif-7457`. It no longer has a domain. Only the owner may delete it.

---

## 4. Repository map

```
apps/api/                 Backend: NestJS 12, TypeScript 6, Drizzle ORM, PostgreSQL + PostGIS, Valkey/BullMQ
  src/main.ts, worker.ts  Two processes: HTTP API and background worker (offer start/expiry, notification jobs)
  src/config/             Env validation (Zod), logger (pino, masks coordinates/phones), .env loader
  src/common/             Errors, response envelope, pagination, auth decorators, validation pipe, phone, slug
  src/infrastructure/     database (Drizzle, PostGIS helpers, migrate), redis, storage, images (sharp), sms, email,
                          events (in-process domain events, ADR-0016)
  src/modules/            users, access-control, auth, audit, platform-settings, locations, categories,
                          businesses, offers, discovery, engagement (saves, follows, taps), reports,
                          notifications (inbox, preferences, email outbox), analytics (read-only
                          reporting: daily totals, searches, dashboards), meta, health,
                          admin-activity (audit feed with names)
                          (modules talk only via exported services)
  src/jobs/               BullMQ jobs (offer lifecycle; notifications: email outbox, ending soon, admin summary;
                          analytics: nightly totals + 180-day clean-up, weekly business summary;
                          maintenance: nightly retention clean-up of personal data)
  src/cli/                migrate, seed, grant-role, add-localities, reset-mfa (emergency), export-openapi
  database/migrations/    SQL migrations (0000–0012); some PostGIS/search SQL is hand-written
  test/                   Integration tests (e2e-spec) + helpers (per-file database cloned from a template)
apps/web/                 Website: Next.js 16 (App Router), React 19, Tailwind CSS 4
  src/app/                Routes (see §7)
  src/components/         Forms (business, offer), cards, moderation panel, image upload, auth image…
  src/lib/                api client + session, auth context, types, money, time, location, offer-form
  src/proxy.ts            Per-request CSP nonce (Next 16 "proxy" = old middleware)
deploy/staging/           EC2 preview server: docker-compose, Caddyfile, setup-server.sh, deploy.sh,
                          set-secret.sh, backup.sh, restore-drill.sh, .env.example
docs/                     ADRs (docs/adr) and guides (api, auth, authorization, database, business/offer
                          workflow, moderation, deployment)
ARCHITECTURE.md           Overall design (accepted 2026-09-30)
.github/workflows/ci.yml  CI: lint, types, unit + integration tests, builds, OpenAPI export
```

Workspace tooling: **pnpm 12.4.2** workspaces + **Turborepo 2.11**, **Node 24.15+** (tested on 24.21.0, see `.nvmrc`). `AGENTS.md` is written automatically by Turborepo; leave it.

---

## 5. Run it locally

Requirements: Node 24.15+, `npm i -g pnpm@12`, Docker Desktop running.

```bash
pnpm install
docker compose up -d                                  # local PostGIS + Valkey
cp apps/api/.env.example apps/api/.env                # then fill JWT_ACCESS_SECRET and OTP_HASH_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
pnpm --filter @offer-platform/api db:migrate
pnpm --filter @offer-platform/api db:seed             # roles + permissions (run after every migrate)
pnpm --filter @offer-platform/api start:dev           # API on http://localhost:3000 (docs at /api/docs)
pnpm --filter @offer-platform/api start:worker:dev    # background worker (second terminal)

cp apps/web/.env.example apps/web/.env.local          # NEXT_PUBLIC_API_URL=http://localhost:3000
pnpm --filter @offer-platform/web dev -- --port 3001  # website on http://localhost:3001
```

- Add `http://localhost:3001` to `CORS_ORIGINS` in `apps/api/.env`. Values already set in the environment override the file.
- Login codes in development are printed to the API log: `[DEV SMS]` / `[DEV EMAIL]`.
- First admin locally: log in once, then `pnpm --filter @offer-platform/api admin:grant-role --email you@example.com --role SUPER_ADMIN` (or `--phone`).
- Areas locally: `pnpm --filter @offer-platform/api admin:add-localities --city hubballi --names "Vidya Nagar,Keshwapur"`.

**Tests and checks:**

```bash
pnpm turbo run lint typecheck test build              # everything, both apps
pnpm --filter @offer-platform/api test:integration    # needs Docker (Testcontainers)
```

**Database change:** edit a module's `*.schema.ts`, then run `pnpm --filter @offer-platform/api db:generate --name=<change>`, **review the SQL** (drizzle-kit quotes PostGIS types, so unquote `geography(Point, 4326)` by hand), then `db:migrate`. Never edit a migration that has already run anywhere shared.

---

## 6. Deploying and operating

**Website:** merge to `main` and Vercel deploys it automatically. Project env vars:
- `NEXT_PUBLIC_API_URL=https://13-235-201-166.sslip.io`
- `ENABLE_EXPERIMENTAL_COREPACK=1` (so Vercel uses pnpm 12)
- `NEXT_TELEMETRY_DISABLED=1`

**API** is not auto-deployed yet. From the repo root on a machine that has the key:

```bash
bash deploy/staging/deploy.sh 13.235.201.166 <path-to>/offer-platform.pem
```

It uploads the **committed** source (`git archive`, so no local files and no `.env`), builds the image on the server (slow on t3.micro), runs migrations and seed, restarts api/worker, and waits for `/health/ready`.

**On the server** (`ssh -i offer-platform.pem ubuntu@13.235.201.166`, then `cd /opt/offer-platform/src/deploy/staging`):

| Task | Command |
|---|---|
| Status / logs | `docker compose ps` · `docker compose logs -f --tail 100 api` (also `worker`, `caddy`) |
| Phone login code (preview) | `docker compose logs api \| grep "DEV SMS" \| tail -1` |
| Notification jobs | `docker compose logs worker \| grep -i notification` (startup: "Notification jobs scheduled"; each run: "Notification emails processed" with sent/failed counts) |
| Analytics jobs | `docker compose logs worker \| grep -i analytics` (startup: "Analytics jobs scheduled"). Daily totals are rebuilt at start-up and 00:30 IST; check with `docker compose exec postgres psql -U offer_platform -d offer_platform -c "select max(day) from analytics_daily"` |
| Everyday admin work | **Use the website** (`/admin`): users and roles, categories, cities & areas, settings, activity log. The commands below are for bootstrapping and emergencies. |
| Make someone admin | `docker compose exec api node dist/cli/grant-role.js --email <verified email> --role SUPER_ADMIN` (or `ADMIN`, or `--phone`). They must then set up 2-step login (authenticator app) at their first admin visit |
| Lost authenticator (emergency) | `docker compose exec api node dist/cli/reset-mfa.js --email <address>` (or `--phone`). Normally a Super admin uses "Reset 2-step login" on the user's page |
| Retention job | `docker compose logs worker \| grep -i retention` (03:00 IST: "Retention clean-up done" with counts) |
| Backup restore drill | `bash restore-drill.sh` (temporary database, live data untouched). Run it from the file, never piped through ssh |
| Add areas | `docker compose exec api node dist/cli/add-localities.js --city hubballi --names "A,B"` (idempotent) |
| Change Gmail App Password | `./set-secret.sh SMTP_PASSWORD` (hidden prompt; restarts API) |
| Backup now / restore | `bash backup.sh` → `backups/*.dump` (nightly 02:30, 14 kept) · restore: see `docs/deployment.md` |

From Windows `cmd`, use `%USERPROFILE%\.ssh\offer-platform.pem`. From PowerShell, use `$HOME\.ssh\offer-platform.pem`.

Full guide: [docs/deployment.md](docs/deployment.md).

---

## 7. How the product works (cheat sheet)

**Accounts and login** ([docs/authentication.md](docs/authentication.md), ADR-0006 + ADR-0015):
- **Sign up** with a 6-digit code sent to an email or phone (SMS vendor pending). The welcome screen then asks for a name and a **password**.
- **2-step login** (Phase 8, ADR-0018, owner decision 2026-10-09):
  - **required for every admin permission**: authenticator app (Google/Microsoft Authenticator…), 6-digit codes;
  - the admin area shows the setup (QR code + 10 recovery codes) until it is on;
  - logins (code, password and forgot password alike) then ask for the app code;
  - a code works once; 5 wrong codes lock it for 15 minutes; secrets are encrypted;
  - lost phone: a recovery code, a Super admin's "Reset 2-step login", or `admin:reset-mfa` on the server;
  - resetting or turning it off ends admin access at once.
- **Log in** with email/phone + password. "Log in with a code instead" stays available.
- **Forgot password:** a code to the email/phone, then a new password. Every session ends.
- Password rules: 8–128 characters, very common passwords and the user's own email/phone refused. Stored as Argon2id (Node built-in). 5 wrong tries lock the account for 15 minutes.
- The access token (JWT, 15 min) is kept in memory. The refresh token (30 days) is single-use and rotates; reusing an old one revokes the whole session.
- An email typed into a profile is **unverified** and never logs anyone in or receives a role. It becomes verified only after the person logs in with a code sent to it.
- Phone and email logins are separate accounts for now.
- Admin passwords are not set by anyone but the admin (log in with a code, then choose one). Common ones like `Admin@123` are refused by design.

**Roles** ([docs/authorization.md](docs/authorization.md)):
- Roles: CUSTOMER, BUSINESS_OWNER, BUSINESS_STAFF, ADMIN, SUPER_ADMIN.
- Permissions: `users:read`, `users:manage-status`, `roles:assign`, `audit:read`, `businesses:read|verify|manage`, `offers:read|moderate`, `reports:moderate`, `analytics:read`, `categories:manage`, `locations:manage`, `settings:manage`.
- The backend always checks permissions; the website only hides buttons. Every permission also needs a session that passed 2-step login (`403 MFA_SETUP_REQUIRED` / `MFA_REQUIRED`).

**Business lifecycle** ([docs/business-workflow.md](docs/business-workflow.md)):
- `PENDING → (submit) UNDER_REVIEW → VERIFIED | REJECTED`; `SUSPEND` and `REACTIVATE` are available from most states.
- No identity documents are collected (ADR-0012): a **shop photo** is required, the owner photo is optional, and the registration number is optional.
- These requirements are an admin setting (`business.verification`).
- `CLOSED` (Phase 8) is final: the owner deleted their account. The shop is hidden, its offers ended, the owner photo deleted; nobody can edit, suspend or reactivate it.
- Name, phone, registration number and location **lock** while the business is under review or verified; only admins can change them then.

**Offer lifecycle** ([docs/offer-workflow.md](docs/offer-workflow.md), [docs/moderation.md](docs/moderation.md)):
- Seven types: PRICE_DROP, PERCENTAGE_OFF, FLAT_AMOUNT_OFF, BUY_X_GET_Y, FREE_GIFT, COMBO, OTHER.
- Path: `DRAFT → PENDING_REVIEW → (approve) SCHEDULED/ACTIVE → EXPIRED`. Admins can also REJECT or REQUEST_CHANGES (back to DRAFT). The business can PAUSE/RESUME/END.
- **Every** offer is reviewed by an admin. Editing an approved offer sends it back to review.
- Only verified businesses can submit offers.
- Limits are an admin setting (`offers.limits`): 90 days maximum, 5 photos.
- The worker activates scheduled offers and expires ended ones.

**Money:**
- Always **integer paise**. The discount % is **computed on the server**; never accept one from a client.
- The website converts typed rupees to paise exactly, without float arithmetic.

**Discovery** ([docs/api.md](docs/api.md)):
- Endpoints: `GET /discover/offers` and `GET /discover/home`.
- Search understands "under 2000", "50% off", "near me" and "in <area>", tolerates typos, and works in Kannada.
- Near me defaults to 5 km (options 2/5/10/25).
- Ranking is rule-based, defined in `modules/discovery/ranking.ts`.
- Customer coordinates are used per request only, never stored, and masked in logs.

**Engagement and reports** (Phase 5, [docs/api.md](docs/api.md)):
- **Logged-in customers** can save offers (♡), follow shops, share, and report an offer. Visitors are sent to log in.
- **Saved page:** split into "Still on" and "Ended". Ended offers can't be saved.
- **Following:** the home page shows "From shops you follow".
- **Taps:** share, call, WhatsApp, directions and website are counted **for everyone** since Phase 7 (owner decision 2026-10-08; Phase 5 counted logged-in users only). The same person or visitor tapping the same thing counts once per 30 minutes. No location or IP is stored.
- **Reports:**
  - the specification's 8 reasons;
  - one open report per person per offer;
  - admins can dismiss, warn the business (the message shows on its dashboard), suspend the offer, or suspend the business. Suspending closes all related open reports and reuses the normal suspension with a reason.
- **Business dashboard:** a "Last 30 days" summary with a link to the Performance page (Phase 7).

**Analytics** (Phase 7, ADR-0017, [docs/api.md](docs/api.md)):
- **Who is counted:** everyone (owner, 2026-10-08). Logged-in users by their token; visitors by a random id the browser keeps (`op.visitor` in localStorage). Once per person/visitor per thing per 30 minutes.
- **Not counted:** bots and scripts (by User-Agent, anonymous only), views by the shop's own staff, views by admins.
- **Page views** are sent by the browser after the page shows (`components/track-view.tsx`) and **never store who viewed**.
- **Searches:** typed words (first page only) with the city and the number of results; no user; digit runs of 5+ and email addresses become `#`.
- **Spam guard:** anonymous events are capped at 1,000 per IP address per hour (hashed key, never stored); extra events are skipped quietly.
- **Daily totals** (`analytics_daily`): rebuilt by the worker at start-up and at 00:30 IST (two days back plus any missed days). Dashboards use daily totals before yesterday and raw events for yesterday and today.
- **Retention:** raw events and searches 180 days; daily totals forever.
- **Business Performance page** (`/business/[id]/insights`, owner and staff): 7/30/90 days, change vs the previous period, daily chart, every offer with taps per 100 views, best offer.
- **Admin Insights** (`/admin/insights`, `analytics:read`): review queues and their oldest item, visits, people (sign-ups, logins, active users), shops and offers (live by city and category), top offers and shops, top searches and **searches that found nothing**.
- **Weekly summary:** Mondays 09:00 IST to every verified shop with activity or a live offer (notification type `BUSINESS_WEEKLY_SUMMARY`, inbox + email by default).
- Charts are our own SVG/CSS (`components/charts.tsx`), no chart library.

**Privacy: deletion and retention** (Phase 8, [docs/authentication.md](docs/authentication.md)):
- **Deleting an account** erases in one transaction:
  - name, phone, email, password, verification dates and roles;
  - sessions, login codes, 2-step login;
  - notifications and their settings, saves and follows;
  - past taps stay counted without the person.
- **Shops they own are closed** (owner decision).
- **Nightly clean-up at 03:00 IST** (owner, "longer" option):
  - login codes after 90 days;
  - ended sessions 90 days after they end;
  - notifications after 1 year;
  - activity log after 7 years;
  - analytics keeps its 180-day rule.

**Notifications** (Phase 6, ADR-0016, [docs/api.md](docs/api.md)):
- **Who gets what:**
  - shop: business verified / rejected / suspended / reactivated, a warning from an admin, offer approved / rejected / changes requested / suspended, offer ending within a day;
  - customer: a followed shop's offer goes live, a saved offer ends within a day;
  - admins: a daily summary at 09:00 IST (businesses and offers waiting, open reports), skipped when everything is zero.
- **Channels:** 🔔 inbox always; **email on by default for shop and admin messages, off for customers** (they opt in per type on the Account page). Push comes later with the mobile apps.
- **Rules:** email only to a **verified** address; customer emails wait out **quiet hours 22:00–08:00 IST**; **no daily limit** (owner, 2026-10-08). Each message is sent once (a dedupe key per user).
- **How it works:** moderation and lifecycle code emit domain events **after commit**; the notifications module listens and writes rows. A handler failure is logged and never breaks the action. Emails wait in the same table as an **outbox**; the worker sends them every minute (3 tries, 5 minutes apart, then FAILED).
- Every email has a signed one-click **"Stop emails like this"** link (`/unsubscribe?token=…`, HMAC key derived from `OTP_HASH_SECRET`; no login needed).

**Website routes** (`apps/web/src/app`):

| Area | Routes |
|---|---|
| Customer | `/`, `/search`, `/offers/[slug]` and `/businesses/[slug]` (server-rendered, OpenGraph tags), `/saved`, `/following`, `/notifications`, `/unsubscribe` |
| Account | `/login` (with the 2-step code step), `/account` (2-step login at `#two-step`, notification settings at `#notifications`) |
| Business portal | `/business`, `/business/new`, `/business/[id]`, `/business/[id]/insights`, `/business/[id]/offers/new`, `/business/offers/[offerId]` |
| Admin | `/admin` (review queues), `/admin/insights`, `/admin/reports[/id]`, `/admin/businesses/[id]`, `/admin/offers/[id]`, `/admin/users[/id]`, `/admin/categories`, `/admin/locations`, `/admin/settings` (Super admin), `/admin/activity` |

Images:
- **Public images** load directly from the API.
- **Private images** (verification photos, owner and admin views) are fetched with the token and shown as `blob:` URLs.

---

## 8. Definition of done / how we verify

- **Real database:** a feature is not "working" until a test passes against a real database. Integration tests use Testcontainers; never mock the database.
- **CI must be green** before merging: lint, types, unit + integration tests, builds.
- **Website changes:** also run the flow in a browser against a local API.
- **The 2026-10-01 end-to-end run** passed on a local API + database:
  - login, register business, shop photo, submit;
  - admin verifies;
  - offer created (40% computed by the server), photo added, submitted;
  - admin approves;
  - customer sees the offer "near me" (1.1 km), in search ("shoes under 2000" matches; "under 1000" and "50% off" do not) and on the server-rendered offer/business pages.
- **Docs:** update the docs and this file in the same pull request as the change.

---

## 9. Working rules

**Process**
- Work **phase by phase** (ARCHITECTURE.md §15). **Explain the plan and get the product owner's approval** before implementing each phase or any large feature. Ask when unsure; never guess facts (library APIs, area names, vendor details). Check current docs and npm.
- Record any structural or stack decision as a **new ADR** in `docs/adr/`. Accepted ADRs are never edited; a new one supersedes them.
- Branch per change (`feat/…`, `fix/…`), open a pull request, merge only when CI is green. Commit messages: conventional style (`feat(api): …`, `fix(web): …`).

**Hard rules**
- Codename `offer-platform` in code. The brand name comes from config only (ADR-0009).
- Money is integer paise. The discount % is computed server-side (ADR-0008).
- Never hard-delete offers or businesses. Never trust frontend authorization. Every endpoint validates input with Zod.
- Modules talk only through exported services (ADR-0002).
- No secrets in code or chat. `.env` is never committed. No mock data paths reachable in production.
- No payments, subscriptions or monetization in the MVP. Future features sit behind feature flags that default to `false`.
- Secrets are typed by a human into `set-secret.sh` on the server, never pasted into chats or tools.

---

## 10. What's next (in priority order)

**Decisions needed from the product owner:**
1. **SMS vendor** + TRAI DLT registration (blocks real phone login).
2. **Maps/geocoding vendor** (Google / Ola Maps / Mapbox-OSM). Today businesses type coordinates or use "I am at the shop now".
3. **Final product name + domain.** Moving means:
   - DNS: `api.<domain>` → Elastic IP, website domain → Vercel;
   - API `.env`: `API_DOMAIN`, `APP_PUBLIC_URL`, `CORS_ORIGINS`, `APP_DISPLAY_NAME`;
   - Vercel: `NEXT_PUBLIC_API_URL`.
4. **MVP launch date.** Push provider (FCM proposed) when the mobile apps start.
5. **Real list of areas** for Hubballi-Dharwad (replace the starter test list).

**Product work (each needs approval first):**
- **Phase 9 (production readiness)** is next. It needs the owner decisions above, then approval.
- See the detailed plan in **§13 Roadmap**. (Admin screens and Phases 5–8 are done.)

**Known gaps / technical debt:**
- **Refresh token storage:** the token sits in `localStorage` (ADR-0014). Once web and API share a real parent domain, move it to an httpOnly cookie.
- **Preview infrastructure is not launch-grade:**
  - single t3.micro server;
  - PostgreSQL in Docker → move to RDS (PostGIS, point-in-time recovery);
  - Valkey → ElastiCache;
  - images on server disk → S3;
  - backups on the same disk;
  - no monitoring or alerting.

  All of this is Phase 9.
- **API deploys are manual** (`deploy.sh`). Add a CI deploy with approval.
- **No automated browser tests** for the website yet (add Playwright).
- **Phone and email accounts can't be linked** into one account.
- **Old personal Vercel project** `dodoom` can be deleted by the owner.
- **Visitor counts are approximate.** A visitor who clears browser storage or switches browser counts again; someone who blocks storage gets a new id per page load.
- **`/me/businesses/:id/engagement` taps** are all-time counts of raw events, which now cover only 180 days. The website uses the insights endpoint; mobile apps should too.
- **Search dedupe uses IP + User-Agent** (hashed, 30 minutes in Valkey). People sharing one mobile IP and the same phone model searching the same words in 30 minutes count once.
- **Gmail sends about 500 emails a day at most.** With no daily limit per customer, a busy day could reach it; those emails fail after 3 tries (the inbox still works). Move to a real email provider in Phase 9.
- **Accepted risks until Phase 9** (owner, 2026-10-09; see [the audit report](docs/security-audit-2026-10-09.md)):
  - refresh token in `localStorage`;
  - inline styles allowed by the website CSP;
  - API docs public on the preview;
  - phone codes in the preview log;
  - reports keep the reporter's note after account deletion;
  - backups on the same disk, no alarms.
- **Rotating `OTP_HASH_SECRET`** makes every stored authenticator secret unreadable: run `admin:reset-mfa` for each admin afterwards (ADR-0018).
- **Domain events are in-process.** An event lost in a crash between commit and handler is not retried (ADR-0016); fine for the MVP, revisit if notifications become critical.

---

## 11. Gotchas we already hit (save yourself the time)

**API and tooling**
- pnpm 12: don't use `pnpm -s`; it breaks script arguments.
- Zod 4: `.partial()` keeps `.default()` values, so PATCH schemas are built from default-free fields.
- drizzle-kit quotes custom PostGIS types in generated SQL; unquote by hand.
- Never `Promise.all` queries on one transaction; run them sequentially.
- Drizzle wraps pg errors: check `error.cause.code` / `constraint`.
- BullMQ 6 has its own `RedisOptions` type.
- nodemailer pinned to 10.0.10 (pnpm minimum-release-age).
- Discovery SQL numeric params need `::float8` casts.
- The search parser must keep `\p{M}` (Kannada combining marks).
- Helmet's default `Cross-Origin-Resource-Policy: same-origin` blocked every public image on the website. Public media endpoints now send `cross-origin`; private ones keep `same-origin` (integration tests check both).

**Website (Next.js 16 / Tailwind 4)**
- `middleware` is now `proxy.ts`, and route params are Promises.
- The CSP nonce only works with dynamic rendering, so the root layout calls `connection()`.
- Tailwind 4: custom classes used with `@apply` must be declared with `@utility`.
- oxlint: the React `set-state-in-effect` rule is off on purpose (data-loading effects).
- The header has many links: keep its rows `flex-wrap` and check a 375 px width (it overflowed after Phase 5 until Phase 6 fixed it).

**Windows and tools**
- Mark shell scripts executable in git with `git update-index --chmod=+x`; Windows loses the bit and the server then refuses to run them.
- Git Bash rewrites `/v9/...` paths. Use `MSYS_NO_PATHCONV=1 vercel api ...`.
- Empty values in `.env` count as unset.
- Docker Desktop auto-updates can stop local containers: restart them.

**Local runs (learned in Phase 5)**
- If `node dist/main.js` fails with "Cannot find module …/config.module.js", the incremental build is stale: delete `apps/api/dist` and `apps/api/tsconfig.build.tsbuildinfo`, then rebuild.
- Start the API **from `apps/api`** (it reads `apps/api/.env`), and the website with `pnpm --filter @offer-platform/web …`, so the two folders can't get mixed up.
- Browsers may block the clipboard. Never make counting depend on it; the share button counts first, then copies or shows the link.
- The local website runs on port 3001, but `apps/api/.env.example` allows only 5173: start the API with `CORS_ORIGINS=http://localhost:3001` (the environment beats the file) or add it to your `.env`.
- Local notification emails are printed by the **worker** (`[DEV EMAIL]`); login codes are printed by the API.
- Nest: a `@Post` that returns data answers 201 unless it has `@HttpCode(HttpStatus.OK)`.
- Drizzle `sql` templates expand a JS array into a parameter list: write `id IN ${ids}` (guard empty arrays), not `= ANY(${ids}::uuid[])`.
- Stopping a background `next dev` task on Windows can leave Next's server process running on port 3001 in a broken state (blank pages, "Jest worker" errors). Find it with `netstat -ano | grep :3001` and stop that process.
- Analytics days before yesterday come from `analytics_daily`. On a fresh local database, start the **worker** once (it rolls up at start-up) or the dashboards show zeros for older days.
- Integration tests that act as an admin must use `makeAdmin(ctx, user, role)` (grants the role **and** sets up 2-step login through the API); `grantRole` alone gets `MFA_SETUP_REQUIRED`. Use `nextTotp(user)` for further codes: a code works only once.
- In Git Bash, `node -e "..."` with backticks inside runs them as commands. Write edit scripts to a file instead (the scratchpad), as with heredocs.

**Server**
- Never pipe a script into `ssh ... bash -s` when it runs `docker compose exec`: exec reads the same input and swallows the rest of the script. Copy the file over and run it there (or add `< /dev/null`).
- t3.micro needs the swap file to build the image.
- `setup-server.sh` needs `.env.example` copied next to it.
- `crontab -l` fails when no crontab exists yet; the script now tolerates that.

---

## 12. Document index

- [docs/security-audit-2026-10-09.md](docs/security-audit-2026-10-09.md): Phase 8 audit, every finding and its status.
- [information.md](information.md): **complete project reference**: the idea, the original specification vs final decisions, tech stack, every module, data model, flows, phases, feature checklist, open decisions.
- [README.md](README.md): quick start.
- [ARCHITECTURE.md](ARCHITECTURE.md): design, data model, phases.
- [docs/adr/](docs/adr/README.md): every decision and why (0001–0018).
- API and auth: [docs/api.md](docs/api.md) (endpoints, error codes) · [docs/authentication.md](docs/authentication.md) · [docs/authorization.md](docs/authorization.md) · [docs/database.md](docs/database.md).
- Workflows: [docs/business-workflow.md](docs/business-workflow.md) · [docs/offer-workflow.md](docs/offer-workflow.md) · [docs/moderation.md](docs/moderation.md).
- Operations: [docs/deployment.md](docs/deployment.md).

---

## 13. Roadmap (proposed: each phase needs approval before work starts)

> **Status of this section:** a **proposal** written on 2026-10-01. Nothing below is approved or built unless it is marked ✅.
> - **Before starting a phase:** explain the plan to the product owner, get approval, then mark it "Approved (date)" here. Big decisions get an ADR.
> - **Order:** A first (small, and it removes command-line-only admin work), then 5 → 9. Phase 9 infrastructure tasks can run in parallel once the owner's decisions are made.
> - **"Done when" for every phase also includes:**
>   - integration tests against a real database;
>   - a browser run of the new screens;
>   - docs and this file updated;
>   - CI green;
>   - deployed to the preview.

### A. Admin screens on the website — ✅ Done 2026-10-02 (PR #10)

**Why:** several admin jobs exist in the API but today need server commands or raw API calls.

**Dependencies:** none. The API endpoints and permissions already exist.

**Website** (`/admin/...`, each screen shown according to the admin's permissions):

| Screen | What it does | Permission |
|---|---|---|
| Categories | Show the tree; add, rename, deactivate; reorder | `categories:manage` |
| Cities and areas | Add or rename cities and localities; deactivate. Replaces `add-localities` for daily use | `locations:manage` |
| Platform settings | Business verification requirements (`business.verification`); offer limits: max days, max photos (`offers.limits`) | `settings:manage` |
| Users | Search, view, suspend or reactivate with a reason; grant or revoke ADMIN / SUPER_ADMIN | `users:read`, `users:manage-status`, `roles:assign` |
| Audit log | Filter by user, entity, action and date; read-only | `audit:read` |

**Server:** only small additions where a screen needs data the API doesn't return yet. Check [docs/api.md](docs/api.md) first.

**Done when:**
- Every admin task in §6 except server operations can be done in the browser.
- `grant-role` and `add-localities` are needed only for bootstrapping.

### Phase 5. Engagement — ✅ Done 2026-10-08 (PR #12)

> Built as planned, with the owner's choices (2026-10-03):
> - reports from logged-in users only;
> - all four admin actions;
> - **only logged-in users' taps counted** (changed to everyone in Phase 7, 2026-10-08);
> - simple totals on the business dashboard.
>
> Tables use the specification's names: `saved_offers`, `business_followers`, `reports`, `report_actions`, `analytics_events`.


**Goal:** customers keep and share offers, follow shops and report bad offers; businesses learn which offers interest people.

**Dependencies:** none (A recommended first, so admins have screens to work the report queue).

| Feature | Customer side | Business / admin side |
|---|---|---|
| Save offers | Heart button on offer cards and pages; a "Saved" page; ended offers marked as ended | Saves per offer (feeds Phase 7) |
| Follow a business | "Follow" button on the business page; a "Following" list | Follower count |
| Share | Share button (WhatsApp / copy link); the share is recorded | Share count |
| Contact taps | Taps on Call / WhatsApp / Directions are recorded | Counts per offer and business |
| Report an offer | "Report" with a reason (wrong price, expired, misleading, offensive, other) and an optional note | Admin **report queue**: dismiss, or suspend the offer (uses the existing moderation) |

**Server (proposed):**
- New tables:
  - `saved_offers` (user + offer, unique);
  - `business_follows`;
  - `offer_reports` (reason, note, status, handled by);
  - `engagement_events` (type, offer/business, time, optional user, **never coordinates**).
- Endpoints:
  - `/me/saved-offers`;
  - `/me/follows`;
  - `POST /offers/:slug/events` (rate-limited, no login needed);
  - `POST /offers/:slug/reports` (login required, one open report per user per offer);
  - `/admin/reports`.
- New permission `reports:moderate`. Report decisions are audited.

**Done when:**
- A logged-in customer can save, follow, share and report.
- Taps are counted.
- Admins can handle reports end to end.

### Phase 6. Notifications — ✅ Done 2026-10-08 (PR #13)

> Built as approved on 2026-10-08: inbox + email now, **push later with the mobile apps**; customers inbox-only by default; no "nearby offer" alerts; quiet hours 22:00–08:00 IST for customer emails; **no daily limit** (the owner changed 5 a day to none). The plan below is kept for history; §7 describes what was built.

**Goal:** people hear about what matters to them without opening the site.

**Dependencies:**
- **Owner decision: push provider** (FCM proposed).
- Email already works (Gmail SMTP in preview). Production needs a sender on the real domain, see Phase 9.

**Channels:**
- email (exists);
- **in-app inbox** (new);
- **push**: web push now if approved, mobile push later with the apps.

**Events (proposed first set):**

| To | When |
|---|---|
| Business | Business verified / rejected (with reason); offer approved / rejected / changes requested; offer about to end; offer reported and suspended |
| Customer | A followed business publishes a new offer; a saved offer ends within 24 hours |
| Admins | Daily summary: businesses and offers waiting for review, open reports |

**Server:**
- `notifications` table (the inbox) and `notification_preferences` (per user, per event type and channel).
- A BullMQ queue `notifications` with retries and failure logging.
- Templates in code, with the brand name taken from configuration.
- Email: an unsubscribe link in every message; never sent to unverified emails.
- Push: quiet hours.

**Website:** bell icon with an unread count, an inbox page, and notification settings on the Account page.

**Done when:**
- Each event reaches the right person on the chosen channels.
- Preferences are respected.
- Failures are retried and logged.

### Phase 7. Analytics — ✅ Done 2026-10-09 (PR #14)

> Built as approved on 2026-10-08, with the owner's choices: **views and taps counted for everyone** (anonymous, deduped, no identity stored), **searches recorded**, **raw events kept 180 days** (daily totals forever), **weekly summary to businesses**. Charts are our own SVG (ADR-0017). The plan below is kept for history; §7 describes what was built.

**Goal:** businesses see how their offers perform; admins see the platform's health.

**Dependencies:** Phase 5 (the events).

**Server:**
- Offer page views are recorded like the Phase 5 events.
- A nightly worker job fills `daily_offer_stats` and `daily_business_stats`: views, saves, shares, contact taps, follows.
- Raw events are kept for a limited time (to be decided); daily totals are kept long-term.
- **No personal data** in analytics tables.

**Business dashboard:**
- Per offer and in total, for the last 7 / 30 days: views, saves, shares, calls, WhatsApp taps, directions.
- The best-performing offer.
- Simple charts; the charting library is chosen with an ADR.

**Admin dashboard:**
- New businesses and offers.
- Review queue: size and age.
- Active offers by city and category.
- Reports.
- Sign-ups and logins.

**Done when:** both dashboards match the raw events in a test with known data.

### Phase 8. Security audit — ✅ Done 2026-10-09 (PR #15)

> Built as approved on 2026-10-09, with the owner's choices:
> - **authenticator-app 2-step login for admins**;
> - **secrets rotated at launch only**;
> - **longer retention** (codes 90 days, sessions 90 days, notifications 1 year, activity log 7 years);
> - **shops of deleted owners closed**.
>
> All 6 low-risk items were accepted until Phase 9. See the [report](docs/security-audit-2026-10-09.md). The plan below is kept for history.

**Goal:** find and fix weaknesses before real users arrive.

**Checklist (proposed):**
- **Standard review:** go through OWASP ASVS level 2 for login, sessions, access control, input checks, uploads, errors and logs.
- **Access control:** every endpoint's permission check gets a test proving a lower role is refused.
- **Rate limits:** checked against brute force and spam (codes, passwords, reports, events).
- **Dependencies:** `pnpm audit`, then update.
- **Secrets:** rotate all of them (JWT, code hashing, database, Gmail); confirm none ever entered git history.
- **Website headers:** review the CSP and security headers.
- **Uploads:** file type, size and decompression limits; image metadata stripped.
- **Backups:** do a **restore drill** from backup into a fresh database.
- **Privacy (India DPDP):** list what personal data is stored and for how long; check account deletion end to end.
- **Admin login:** decide on stronger admin login (e.g. 2-step verification for staff).

**Done when:**
- Every finding is fixed or explicitly accepted by the owner.
- A short report is saved as `docs/security-audit-<date>.md`.

### Phase 9. Production readiness (launch)

**Dependencies** (owner decisions):
- final name and domain;
- SMS provider + TRAI DLT registration;
- maps provider;
- AWS budget;
- launch date.

| Area | Proposed work |
|---|---|
| Data | PostgreSQL → **RDS** (PostGIS, point-in-time recovery, automated backups); Valkey → **ElastiCache**; images → **S3** (private photos stay private) |
| Servers | Bigger instance or a managed container service (choice recorded in an ADR); API and worker scale separately |
| Releases | API deploys from CI on merge to `main` → staging; production deploy needs a manual approval; migrations run as a separate release step |
| Domain and email | Real domain: website on Vercel, `api.<domain>` on AWS; email sent from the domain (provider to choose, e.g. SES) with SPF/DKIM/DMARC |
| Login hardening | Refresh token in an httpOnly cookie on the shared parent domain (planned in ADR-0014). 2-step login for admins is done (Phase 8) |
| Secret rotation | Rotate the database password, `JWT_ACCESS_SECRET`, `OTP_HASH_SECRET` and the Gmail App Password (owner decision: at launch). After `OTP_HASH_SECRET`, run `admin:reset-mfa` for every admin so they set up 2-step login again |
| SMS | Real provider behind the existing `SmsProvider` interface; DLT templates; console SMS switched off |
| Monitoring | Central logs, error tracking, uptime checks; alarms for API down, worker stuck, disk/database usage, error rate |
| Quality | Playwright browser tests in CI for the main flows; a load test of search and login |
| Legal pages | Privacy policy, terms of use, contact page (text from the owner) |
| Switch-over | `PREVIEW_MODE=false`, `NODE_ENV=production`, search-engine indexing on, preview data wiped, first admins created |

**Done when:** the MVP success scenario passes on production with a real database, real SMS and email, backups and alarms working, and the owner signs off.

### Later (not scheduled)

- **Mobile apps** (`apps/mobile`), using the same API and OpenAPI contract.
- **One account with both phone and email** (account linking).
- **Address search on a map** (needs the maps provider).
- **Kannada user interface** (search already understands Kannada).
- **Monetization:** business plans, sponsored offers, QR redemption, reviews, rewards, AI recommendations. Each already has a feature flag that defaults to `false`; none is built.

---

## 14. Change log

Newest first. **Every pull request adds an entry here** (see §0). Operational changes made without a PR (servers, accounts, DNS) get an entry too. Format:

```
### YYYY-MM-DD · PR #N (or "Operations, no PR") · <title> · <author: name, or "Claude (AI agent)">
- What changed:
- Why:
- How it was verified:
- Deploy / migration / env notes:
- Follow-ups:
```

### 2026-10-09 · PR #15 · Phase 8: security audit · Claude (AI agent), plan approved by the product owner 2026-10-09
- **What changed:**
  - **Report:** [docs/security-audit-2026-10-09.md](docs/security-audit-2026-10-09.md) (OWASP ASVS L2 walkthrough). 11 findings fixed, 3 owner decisions, 6 low-risk items accepted by the owner until Phase 9. No open High or Critical findings.
  - **2-step login for admins** (ADR-0018):
    - authenticator app (TOTP, RFC 6238, own implementation with the RFC test vectors);
    - setup with a QR code (`qrcode` 1.5.4) and 10 recovery codes;
    - code, password and forgot-password logins answer `{ mfaRequired, mfaToken }`, then `POST /auth/mfa/verify`;
    - sessions carry an `mfa` flag (refresh-token column and access-token claim);
    - every permission needs it; the guard re-checks the database, so a reset ends admin access at once;
    - Super admin reset on the website; `admin:reset-mfa` CLI;
    - 5 new audit actions.
  - **Account deletion completed:** sessions, login codes, 2-step login, notifications and settings, saves and follows erased; taps unlinked; phone-verified date cleared. Owned shops get the new final status `CLOSED`: hidden, offers ended, owner photo deleted (new audit action `BUSINESS_CLOSED`).
  - **Retention job** (worker queue `maintenance`, 03:00 IST): login codes 90 days, ended sessions 90 days, notifications 1 year, activity log 7 years.
  - **Dependencies:** overrides for source-map-js (High) and esbuild (Moderate), both build/dev-only. `pnpm audit`: no known vulnerabilities.
  - **Tests:** `test/security.e2e-spec.ts` walks every route (over 100): visitors 401, customers 403, admins without 2-step login `MFA_SETUP_REQUIRED`. `makeAdmin()` / `nextTotp()` helpers for admin tests.
  - **Backups:** `deploy/staging/restore-drill.sh`; drill on the preview passed (restored in 2 s, PostGIS, 12/12 migrations, counts equal to live).
  - **Website:**
    - the login code step; 2-step settings on the Account page; the admin area asks for setup first;
    - 2-step status and reset on admin user pages;
    - activity sentences for the new actions; the "Closed" status.
  - **Migration 0012:** `user_mfa`, `mfa_recovery_codes`, `refresh_tokens.mfa`, business status `CLOSED`.
- **Why:** Phase 8 of the roadmap; owner decisions 2026-10-09 (authenticator app, rotate at launch, longer retention, close shops).
- **How it was verified:**
  - API 194 unit + 163 integration tests, web 30; lint, types and builds clean.
  - 4 new unit tests (RFC 6238 vectors, base32, drift and reuse, encryption). 8 new integration tests:
    - every route's access rules (2 tests);
    - 2-step setup, the login paths, recovery codes and lockout, reset and disable;
    - account deletion end to end;
    - retention.
  - Found and fixed while testing: a reset admin kept access until the access token expired (the guard now checks the database).
  - Checks: git history scan of 40 commits (clean); live headers of API and website; restore drill on the server.
  - Browser run against a local API:
    - the admin area asks for 2-step setup; QR and key shown; enabled with a code; recovery codes shown once; the admin area opens;
    - after logout, email-code login asks for the app code; a wrong code is refused; the right code opens Insights;
    - the activity log reads "turned on 2-step login".
- **Deploy / migration / env notes:**
  - Migration 0012 + permission sync run on deploy; the worker restarts with the new retention job ("Maintenance jobs scheduled").
  - **After deploy, every admin (including `offerplatform0101@gmail.com`) must set up an authenticator app at the next admin visit:** have a phone with Google or Microsoft Authenticator ready, and save the recovery codes.
  - No new environment variables.
- **Follow-ups:**
  - Phase 9 (production readiness) needs the owner's decisions (domain, SMS, maps, budget, launch date) and approval.
  - At launch: rotate secrets, then `admin:reset-mfa` for each admin.

### 2026-10-09 · PR #14 · Phase 7: analytics · Claude (AI agent), plan approved by the product owner 2026-10-08
- **What changed:**
  - **ADR-0017:** who is counted and how; daily rollups; a read-only reporting module; hand-drawn charts.
  - **API:**
    - `@OptionalAuth()` (public, but a valid token still identifies the caller).
    - `POST /events` is open to everyone: new `OFFER_VIEWED` / `BUSINESS_VIEWED`. Visitors send a random `visitorId`. There is a 30-minute dedupe per person/visitor. Bots and the shop's staff/admin views are skipped, and views store no user.
    - `GET /discover/offers` records typed searches.
    - New module `analytics`:
      - `GET /me/businesses/:id/insights` and `GET /admin/insights` (new permission `analytics:read` for Admin and Super admin);
      - nightly rollup into `analytics_daily`, also at worker start-up, catching up missed days;
      - 180-day clean-up of raw events and `search_logs`;
      - weekly business summary (new notification type `BUSINESS_WEEKLY_SUMMARY`).
    - Worker queue `analytics`: nightly 00:30 IST, weekly Mondays 09:00 IST.
    - **Migration 0011:** `analytics_daily`, `search_logs`, the new notification type.
  - **Website:**
    - views counted on offer and shop pages; taps counted for visitors too;
    - new **Performance** page for shops (`/business/[id]/insights`); the shop dashboard shows "Last 30 days" instead of all-time totals;
    - new admin **Insights** page;
    - SVG/CSS charts.
- **Why:** Phase 7 of the roadmap (spec §30). Owner decisions on 2026-10-08:
  - count everyone (replacing the logged-in-only rule for taps);
  - record searches;
  - 180-day raw retention;
  - weekly summary.
- **How it was verified:**
  - API 190 unit + 155 integration tests, web 30; lint, types and builds clean.
  - 6 new unit tests: India-time days, search clean-up, bot detection. 6 new integration tests:
    - counting rules: dedupe, bots, staff and admin views, anonymous without an id refused, no user on views;
    - business insights with known numbers and permissions;
    - rollup catch-up, idempotent re-run, totals surviving deleted raw events, previous period, 180-day purge;
    - search logging: dedupe, page 2, bots, digit masking, no-results list;
    - admin insights and permissions;
    - weekly summary once per week.
  - 3 new web unit tests.
  - Browser run against a local API, worker and database:
    - simulated visitors and searches; the shop dashboard summary; the Performance page at 30 and 7 days with the offer table and best offer;
    - a logged-out visit counted from the real browser;
    - the admin Insights page with every section; phone width on both pages.
  - Found and fixed during the run:
    - older days showed zero until the first nightly run, so the worker now also rolls up at start-up;
    - "1 followers" now reads "1 follower".
  - Security self-review of the new public endpoint: added a per-IP hourly cap for anonymous events and masking of email addresses in saved searches.
- **Deploy / migration / env notes:**
  - Migration 0011 and the new permission run on deploy (migrate + seed).
  - **The worker must restart** with the new image; its log must show "Analytics jobs scheduled". It also builds daily totals for all existing events at start-up.
  - No new environment variables.
- **Follow-ups:**
  - Phase 8 (security audit) needs approval. Include the new public `POST /events` (spam and rate limits) and the privacy review of analytics and search logs.
  - Mobile apps should send a stable random visitor id the same way.

### 2026-10-08 · PR #13 · Phase 6: notifications · Claude (AI agent), plan approved by the product owner 2026-10-08
- **What changed:**
  - **ADR-0016:** in-process domain events (emitted after commit) + an email outbox in the notifications table.
  - **API:**
    - `infrastructure/events`: a global `DomainEvents` bus. Offer moderation, offer lifecycle (worker activation), business moderation and report warnings emit events.
    - New module `notifications`: 13 message types, defaults per audience, preferences, inbox, signed unsubscribe, emails with "Open", "Stop emails like this" and "Manage notifications" links.
    - Endpoints: `/me/notifications` (+ `unread-count`, `read`), `/me/notification-preferences`, public `POST /notifications/unsubscribe`.
    - **Migration 0010:** `notifications` (inbox + email outbox) and `notification_preferences`.
    - Worker queue `notifications`: email outbox every minute, offers ending within a day hourly, admin daily summary at 09:00 IST.
    - Small read methods added to users, access-control, businesses, offers and engagement (ADR-0002).
  - **Website:** 🔔 with the unread count in the header; `/notifications` inbox (mark read, mark all, open the link); notification settings on `/account#notifications`; `/unsubscribe` page. The header now wraps on phones (it overflowed at 375 px).
  - **Owner change during the phase:** the customer email limit of 5 a day was removed ("no limit"); quiet hours stay.
- **Why:** Phase 6 of the roadmap; specification §29.
- **How it was verified:**
  - API 184 unit + 149 integration tests, web 27; lint, types and builds clean.
  - 4 new unit tests (defaults, quiet hours) and 8 new integration tests: business decisions → inbox + email sent; offer decisions; followers told once when an offer goes live, including activation by the worker; ending-soon once; customer opt-in + quiet hours; preferences + unsubscribe + forged token refused; inbox read/unread and ownership; admin summary once a day.
  - Browser run against a local API, worker and database: an admin suspended and reactivated an offer → the owner got an inbox item and an email (sent by the worker), the follower got an inbox item only. Checked the bell count; clicking an inbox item (marks it read, opens the offer, clears the bell); a preference toggle saved; the unsubscribe link worked and a forged one was refused; phone width.
- **Deploy / migration / env notes:**
  - Migration 0010 runs automatically on deploy. **The worker must restart** with the new image (`deploy.sh` does it); its log must show "Notification jobs scheduled".
  - No new environment variables (`APP_PUBLIC_URL` is used for email links; the unsubscribe key is derived from `OTP_HASH_SECRET`).
- **Follow-ups:**
  - Push notifications with the mobile apps (FCM proposed).
  - Notification retention (Phase 8) and a real email provider (Phase 9; Gmail's ~500 a day).
  - Phase 7 needs approval.

### 2026-10-08 · PR #12 · Phase 5: engagement and reports · Claude (AI agent), plan approved by the product owner 2026-10-03
- **What changed:**
  - **API:** new modules `engagement` (saved offers, follows, share/contact taps, business totals, followed-shops feed) and `reports` (customer reports; admin dismiss, warn, suspend offer, suspend business; business warnings).
  - **Migration 0009:** `saved_offers`, `business_followers`, `analytics_events` (the full specification event list), `reports`, `report_actions`.
  - New permission `reports:moderate` (Admin and Super admin). New audit actions `REPORT_DISMISSED`, `BUSINESS_WARNED`, `REPORT_RESOLVED`.
  - The offers and businesses modules export small read methods (by id, by ids, live offers of followed shops) and their moderation services, so suspensions reuse the existing rules and audit.
  - **Website:**
    - ♡ on cards and offer pages; Share (phone share sheet / WhatsApp / copy link); counted contact links; Report form;
    - Follow on shop pages; `/saved` and `/following`; a home section "From shops you follow";
    - business dashboard totals and warnings; admin **Reports** queue and decision page;
    - activity-log sentences for report decisions.
- **Why:** Phase 5 of the roadmap; specification §23–27 and §30.
- **How it was verified:**
  - 10 new integration tests (saves, ended offers, follows/feed, tap counting and dedupe, report rules, all admin actions, warnings, permissions, activity labels) and 1 new web unit test.
  - Browser run against a local API and database:
    - a visitor's ♡ leads to login;
    - sign-up, saving from a card, the Saved page;
    - share, call tap, report;
    - follow, the home "From shops you follow" section, the Following page;
    - the admin queue and "warn the business";
    - the owner dashboard showing the counts and the warning.
  - Found and fixed one bug: the copy-link share wasn't counted when the browser blocked the clipboard.
- **Deploy / migration / env notes:**
  - Migration 0009 and the permission sync run automatically on deploy (migrate + seed).
  - The API is deployed before merging (backward compatible); the website deploys on merge.
- **Follow-ups:**
  - Phase 6 needs approval.
  - Deleted accounts keep their saves and follows (see §10).

### 2026-10-02 · PR #11 · information.md, the complete project reference · Claude (AI agent), requested by the product owner
- **What changed:** new `information.md` covering:
  - the idea and business model;
  - the owner's decisions over time;
  - the original specification vs the final decisions;
  - the final tech stack with versions;
  - the architecture;
  - every module in detail;
  - the data model and key flows;
  - security and privacy;
  - phases with what each needs;
  - a feature-by-feature checklist against the specification;
  - environments and accounts;
  - quality, open decisions and a glossary.

  The CLAUDE.md update rule now includes keeping information.md current.
- **Why:** anyone reading one file should understand the whole project.
- **How it was verified:**
  - content checked against the original specification (from the conversation history) and the code: tables, environment keys, versions, ranking weights;
  - one inaccuracy found and fixed before committing (verification is not a ranking factor).
- **Deploy / migration / env notes:** none.

### 2026-10-02 · PR #10 · Admin screens (roadmap A) · Claude (AI agent), plan approved by the product owner
- **What changed:**
  - **Website `/admin`:** a section menu shown according to permissions, with these new screens:
    - **Users:** search; detail page; suspend or reactivate with a reason; grant or remove Admin / Super admin (Super admin only; you can't remove your own Super admin role).
    - **Categories:** tree; add; rename; hide or show; move up or down.
    - **Cities & areas:** add or rename a city or area; hide or show.
    - **Settings** (Super admin only): verification requirements and offer limits.
    - **Activity log:** every audited action as a plain sentence ("Ravi verified business “Shoe House”: reason"), with before/after details, filters, and "see what this user did".
  - **API:** new module `admin-activity` with `GET /admin/activity` (`audit:read`). It is the audit log with actor and item names filled in, looked up through each module's new `labelsFor(ids)` method (ADR-0002, no cross-module table access).
- **Why:** roadmap item A, approved 2026-10-02. Admin work no longer needs server commands.
- **How it was verified:**
  - 3 new integration tests (names, area/setting labels, pagination and permissions).
  - 6 new web unit tests for the sentences.
  - Browser run of every screen against a local API and database, as a Super admin and as a plain Admin (Settings hidden and refused).
- **Deploy / migration / env notes:** no migration. The API was deployed to EC2 before merging (new endpoint); the website deploys on merge.
- **Follow-ups:** none. Next on the roadmap: Phase 5 (needs approval).

### 2026-10-01 · PR #9 · Roadmap, update rule and change log · Claude (AI agent), requested by the product owner
- **What changed:**
  - Added the mandatory update rule (banner at the top and §0).
  - Added the detailed roadmap (§13): admin screens, Phases 5–9, later items.
  - Added this change log, backfilled from the project history.
- **Why:** teammates and agents must be able to pick the project up from this file alone.
- **How it was verified:** documentation only; history checked against `git log` and the merged PRs.
- **Deploy / migration / env notes:** none.

### 2026-10-01 · PR #8 · Password login (ADR-0015) · Claude (AI agent)
- **What changed:**
  - Sign up with a code, then choose a password.
  - Later logins use email or phone + password; code login stays available.
  - Forgot password = code + new password.
  - Change password on the Account page.
  - Rules (owner): 8+ characters; common passwords and the user's own email/phone are refused.
  - Argon2id hashing (Node built-in).
  - 5 wrong tries lock the account for 15 minutes; change and reset end other sessions.
  - Migration `0008`.
  - Login, welcome and account screens updated.
- **Why:** product owner request (needing a code on every new login was friction).
- **How it was verified:**
  - API 180 unit + 128 integration tests (22 new).
  - Browser run of sign-up, password login, change, reset, and an existing user being asked to set a password.
- **Deploy / migration / env notes:**
  - The API was deployed to EC2 **before** merging (backward compatible); the website then auto-deployed.
  - Migration 0008 ran on the server.
- **Follow-ups:**
  - Admins set their own passwords; `Admin@123` is refused by the policy.
  - Phone password reset needs an SMS vendor.

### 2026-10-01 · PR #7 · CLAUDE.md project handbook · Claude (AI agent)
- **What changed:**
  - CLAUDE.md rewritten as the single handbook.
  - ARCHITECTURE.md phase table and the deployment guide updated.
- **How it was verified:** facts checked against the repository and the live environments.

### 2026-10-01 · Operations, no PR · Website moved to the Craftware Vercel team · Claude (AI agent), using the owner's accounts
- **What changed:**
  - The website was imported into the Vercel team **Craftware** as project `dodoom`, connected to `craftware-org/offer_platform_backend`, and deploys automatically from `main`.
  - `dodoom.vercel.app` was moved from the old personal project to it.
- **How it was verified:** the domain serves the new project from Mumbai (`bom1`), and pull requests now show a Vercel check.
- **Follow-ups:** the owner may delete the old personal Vercel project `dodoom`.

### 2026-10-01 · PR #6 · `admin:add-localities` CLI · Claude (AI agent)
- **What changed:**
  - New command to add areas to a city; running it twice adds nothing, and each addition is audited.
  - Used on the preview server: 9 Hubballi + 7 Dharwad **test** areas, names checked against public sources.
- **How it was verified:** run against a real local database (add, re-run, bad input), then on the server.
- **Follow-ups:** replace the test areas with the owner's real list.

### 2026-10-01 · Operations, no PR · Preview server live · Claude (AI agent), with the owner
- **What changed:**
  - EC2 `Offer-Platform` prepared with `setup-server.sh`: swap, firewall, key-only SSH, Docker, secrets generated on the server, nightly backups.
  - **Elastic IP 13.235.201.166** attached.
  - API live at `https://13-235-201-166.sslip.io`.
  - The owner entered the Gmail App Password with `set-secret.sh`; email login is live.
  - First SUPER_ADMIN granted to `offerplatform0101@gmail.com`.
- **How it was verified:** HTTPS certificate, health checks, `/meta`, CORS, a code request, and a Gmail login check that sends no email.

### 2026-10-01 · PR #5 · Website (`apps/web`) + API fixes · Claude (AI agent)
- **What changed:**
  - Next.js 16 website (ADR-0014): customer pages, login, business portal, admin review.
  - Security policy (CSP) with a per-request nonce.
  - Private images loaded with the login token.
  - **Public images now send `Cross-Origin-Resource-Policy: cross-origin`**; browsers had been blocking every photo.
  - `grant-role --email` (verified emails only).
  - Setup-script fixes found on the real server; deploy scripts marked executable.
- **How it was verified:**
  - 20 web unit tests.
  - Browser run of the full MVP flow against a local API and database (see §8).

### 2026-10-01 · PR #4 · Phase 4: discovery, email login, preview mode, staging deployment · Claude (AI agent)
- **What changed:**
  - Search that understands price, %, "near me", areas, typos and Kannada.
  - Near me with PostGIS, ranking, home sections.
  - Email code login, protected against pre-account hijacking.
  - `/meta` and preview mode.
  - Docker image, Docker Compose, Caddy, deploy scripts (ADR-0013).
- **How it was verified:** 167 unit + 119 integration tests; a local rehearsal of the server stack through HTTPS.

### 2026-09-30 · PRs #1–#3 · Phases 1–3 · Claude (AI agent), approved by the product owner
- **#1 Foundation:** configuration, PostGIS, logging, errors, phone code login, roles and permissions, audit log, CI.
- **#2 Businesses:** verification by photo without ID documents (ADR-0012), categories, cities and localities, images, platform settings.
- **#3 Offers:** 7 offer types, prices worked out on the server, price history, admin review of every offer, a worker that starts and ends offers on schedule.
- **Decisions:** recorded as ADRs 0001–0013 (monorepo, NestJS + Drizzle + PostGIS, AWS Mumbai, money in paise, and more).
