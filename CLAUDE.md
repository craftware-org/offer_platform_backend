# CLAUDE.md: project handbook (read this first)

This is the single entry point for **teammates and AI assistants** (Claude Code loads this file automatically). It says what the project is, what is done, what is running where, what is left, and the rules for working here. Deeper detail lives in the linked docs.

> **Last updated: 2026-10-01.** Whoever finishes a piece of work updates the "Status" and "What's next" sections in the same pull request.

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
| 5 | Engagement: save/favourite, follow business, share tracking, contact-click tracking, report an offer | ⏳ Next (needs approval) |
| 6 | Notifications: infrastructure, preferences, dispatch (push/email) | ⏳ |
| 7 | Analytics: ingestion, aggregates, business + admin dashboards | ⏳ |
| 8 | Security audit (findings fixed) | ⏳ |
| 9 | Production readiness: RDS/ElastiCache/S3, CI deploys, monitoring, real SMS, real domain | ⏳ |

**Tests (all must stay green):** API 167 unit + 119 integration tests (real PostgreSQL/PostGIS and Valkey via Testcontainers); web 20 unit tests. Lint and type-check are clean. A full browser end-to-end run of the MVP flow passed on 2026-10-01 (see §8).

**Merged pull requests:**
- #1 Phase 1
- #2 Phase 2
- #3 Phase 3
- #4 Phase 4 + staging
- #5 Website
- #6 `add-localities` CLI

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
  src/main.ts, worker.ts  Two processes: HTTP API and background worker (scheduled offer start/expiry)
  src/config/             Env validation (Zod), logger (pino, masks coordinates/phones), .env loader
  src/common/             Errors, response envelope, pagination, auth decorators, validation pipe, phone, slug
  src/infrastructure/     database (Drizzle, PostGIS helpers, migrate), redis, storage, images (sharp), sms, email
  src/modules/            users, access-control, auth, audit, platform-settings, locations, categories,
                          businesses, offers, discovery, meta, health   (modules talk only via exported services)
  src/jobs/               BullMQ jobs (offer lifecycle)
  src/cli/                migrate, seed, grant-role, add-localities, export-openapi
  database/migrations/    SQL migrations (0000–0007); some PostGIS/search SQL is hand-written
  test/                   Integration tests (e2e-spec) + helpers (per-file database cloned from a template)
apps/web/                 Website: Next.js 16 (App Router), React 19, Tailwind CSS 4
  src/app/                Routes (see §7)
  src/components/         Forms (business, offer), cards, moderation panel, image upload, auth image…
  src/lib/                api client + session, auth context, types, money, time, location, offer-form
  src/proxy.ts            Per-request CSP nonce (Next 16 "proxy" = old middleware)
deploy/staging/           EC2 preview server: docker-compose, Caddyfile, setup-server.sh, deploy.sh,
                          set-secret.sh, backup.sh, .env.example
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
| Make someone admin | `docker compose exec api node dist/cli/grant-role.js --email <verified email> --role SUPER_ADMIN` (or `ADMIN`, or `--phone`) |
| Add areas | `docker compose exec api node dist/cli/add-localities.js --city hubballi --names "A,B"` (idempotent) |
| Change Gmail App Password | `./set-secret.sh SMTP_PASSWORD` (hidden prompt; restarts API) |
| Backup now / restore | `bash backup.sh` → `backups/*.dump` (nightly 02:30, 14 kept) · restore: see `docs/deployment.md` |

From Windows `cmd`, use `%USERPROFILE%\.ssh\offer-platform.pem`. From PowerShell, use `$HOME\.ssh\offer-platform.pem`.

Full guide: [docs/deployment.md](docs/deployment.md).

---

## 7. How the product works (cheat sheet)

**Accounts and login** ([docs/authentication.md](docs/authentication.md)):
- No passwords. Log in with a 6-digit code sent to a phone (SMS, vendor pending) **or** an email address.
- The access token (JWT, 15 min) is kept in memory. The refresh token (30 days) is single-use and rotates; reusing an old one revokes the whole session.
- An email typed into a profile is **unverified** and never logs anyone in or receives a role. It becomes verified only after the person logs in with a code sent to it.
- Phone and email logins are separate accounts for now.

**Roles** ([docs/authorization.md](docs/authorization.md)):
- Roles: CUSTOMER, BUSINESS_OWNER, BUSINESS_STAFF, ADMIN, SUPER_ADMIN.
- Permissions: `users:read`, `users:manage-status`, `roles:assign`, `audit:read`, `businesses:read|verify|manage`, `offers:read|moderate`, `categories:manage`, `locations:manage`, `settings:manage`.
- The backend always checks permissions; the website only hides buttons.

**Business lifecycle** ([docs/business-workflow.md](docs/business-workflow.md)):
- `PENDING → (submit) UNDER_REVIEW → VERIFIED | REJECTED`; `SUSPEND` and `REACTIVATE` are available from most states.
- No identity documents are collected (ADR-0012): a **shop photo** is required, the owner photo is optional, and the registration number is optional.
- These requirements are an admin setting (`business.verification`).
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

**Website routes** (`apps/web/src/app`):

| Area | Routes |
|---|---|
| Customer | `/`, `/search`, `/offers/[slug]` and `/businesses/[slug]` (server-rendered, OpenGraph tags) |
| Account | `/login`, `/account` |
| Business portal | `/business`, `/business/new`, `/business/[id]`, `/business/[id]/offers/new`, `/business/offers/[offerId]` |
| Admin | `/admin`, `/admin/businesses/[id]`, `/admin/offers/[id]` |

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
4. **MVP launch date.** Push notifications vendor (FCM?) for Phase 6.
5. **Real list of areas** for Hubballi-Dharwad (replace the starter test list).

**Product work (each needs approval first):**
- Phase 5: engagement (saved offers, follow a business, share and contact-click tracking, report an offer).
- Admin screens still missing on the website (the API already exists): categories, cities/areas, platform settings, users (suspend, roles), audit log.
- Phases 6–9 as in §2.

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

**Windows and tools**
- Mark shell scripts executable in git with `git update-index --chmod=+x`; Windows loses the bit and the server then refuses to run them.
- Git Bash rewrites `/v9/...` paths. Use `MSYS_NO_PATHCONV=1 vercel api ...`.
- Empty values in `.env` count as unset.
- Docker Desktop auto-updates can stop local containers: restart them.

**Server**
- t3.micro needs the swap file to build the image.
- `setup-server.sh` needs `.env.example` copied next to it.
- `crontab -l` fails when no crontab exists yet; the script now tolerates that.

---

## 12. Document index

- [README.md](README.md): quick start.
- [ARCHITECTURE.md](ARCHITECTURE.md): design, data model, phases.
- [docs/adr/](docs/adr/README.md): every decision and why (0001–0014).
- API and auth: [docs/api.md](docs/api.md) (endpoints, error codes) · [docs/authentication.md](docs/authentication.md) · [docs/authorization.md](docs/authorization.md) · [docs/database.md](docs/database.md).
- Workflows: [docs/business-workflow.md](docs/business-workflow.md) · [docs/offer-workflow.md](docs/offer-workflow.md) · [docs/moderation.md](docs/moderation.md).
- Operations: [docs/deployment.md](docs/deployment.md).
