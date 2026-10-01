# Offer Platform

> **New here?** Read [information.md](information.md) for the complete picture (idea, decisions, tech stack, modules, phases), then [CLAUDE.md](CLAUDE.md) for status, operations and working rules.

A local offers and business discovery platform, built, hosted and operated by **Craftware**. Local businesses publish verified offers for free, and nearby customers discover them. The first market is Hubballi-Dharwad, Karnataka.

> The product name is not final. The code uses the neutral codename `offer-platform`, and the display name is configuration (`APP_DISPLAY_NAME`). The GitHub repository keeps its historical name `offer_platform_backend`, but it holds every app (see [ADR-0010](docs/adr/0010-single-repo-monorepo.md)).

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Architecture and decisions | ✅ Done: [ARCHITECTURE.md](ARCHITECTURE.md), [docs/adr](docs/adr/README.md) |
| 1 | Foundation: config, database, logging, errors, phone-OTP auth, roles/permissions, audit, CI | ✅ Done |
| 2 | Businesses and verification, categories, cities/localities, image uploads | ✅ Done: [docs/business-workflow.md](docs/business-workflow.md) |
| 3 | Offers: 7 types, server-side pricing, price history, admin review, scheduling/expiry worker | ✅ Done: [docs/offer-workflow.md](docs/offer-workflow.md) |
| 4 | Customer discovery (search, near me, ranking), email login, preview server | ✅ Done: [docs/api.md](docs/api.md), [docs/deployment.md](docs/deployment.md) |
| Web | Next.js website: customer, business and admin screens ([ADR-0014](docs/adr/0014-web-app-nextjs-on-vercel.md)) | ✅ Preview live at https://dodoom.vercel.app |

## Repository layout

```
apps/api/            Backend API (NestJS 12, TypeScript 6, Drizzle ORM, PostgreSQL + PostGIS, Valkey/Redis)
apps/web/            Website (Next.js 16, React 19, Tailwind CSS 4): customers, business portal, admin
docs/                Architecture decision records and guides
docker-compose.yml   Local PostgreSQL/PostGIS and Valkey
.github/workflows/   CI
```

Planned later: `apps/mobile`.

## Requirements

- Node.js **24.15+** (see `.nvmrc`; tested on 24.21.0)
- pnpm **12** (`npm install -g pnpm@12`)
- Docker Desktop (local databases and integration tests)

## Getting started

```bash
pnpm install
docker compose up -d
cp apps/api/.env.example apps/api/.env
```

Then fill `JWT_ACCESS_SECRET` and `OTP_HASH_SECRET` in `apps/api/.env`. Generate each with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Create the tables and reference data, then start the API:

```bash
pnpm --filter @offer-platform/api db:migrate
pnpm --filter @offer-platform/api db:seed
pnpm --filter @offer-platform/api start:dev
```

In a second terminal, start the background worker (it activates scheduled offers and expires ended ones):

```bash
pnpm --filter @offer-platform/api start:worker:dev
```

- API: http://localhost:3000/api/v1/health
- Interactive API docs (not served in production): http://localhost:3000/api/docs
- During development, OTP codes are printed to the API log (`[DEV SMS]`). No SMS is sent.

### Website (apps/web)

```bash
cp apps/web/.env.example apps/web/.env.local     # NEXT_PUBLIC_API_URL=http://localhost:3000
pnpm --filter @offer-platform/web dev -- --port 3001
```

Add `http://localhost:3001` to `CORS_ORIGINS` in `apps/api/.env` so the browser may call the local API.

### First administrator

Log in once (phone or email), which creates the account, then run one of:

```bash
pnpm --filter @offer-platform/api admin:grant-role --phone 98XXXXXXXX --role SUPER_ADMIN
pnpm --filter @offer-platform/api admin:grant-role --email you@example.com --role SUPER_ADMIN
```

An email works only once it is verified (the person logged in with a code sent to it).

## Testing

```bash
pnpm turbo run lint typecheck test build
pnpm --filter @offer-platform/api test:integration
```

- **Unit tests** (`src/**/*.spec.ts`) are fast and need no services.
- **Integration tests** (`test/**/*.e2e-spec.ts`) start throwaway PostgreSQL/PostGIS and Valkey containers automatically (Docker must be running) and drive the real application over HTTP.

## Database changes

1. Edit a module's `*.schema.ts`.
2. Run `pnpm --filter @offer-platform/api db:generate --name=<change>` and review the generated SQL in `apps/api/database/migrations/`.
3. Run `pnpm --filter @offer-platform/api db:migrate`.

Commit the migration together with the code change. Never edit a migration that has already been applied anywhere shared.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md): overall design
- [docs/adr](docs/adr/README.md): why each technology was chosen
- [docs/api.md](docs/api.md): API conventions and endpoints
- [docs/business-workflow.md](docs/business-workflow.md): registration, verification, images
- [docs/deployment.md](docs/deployment.md): preview server on EC2, deploys, backups
- [docs/offer-workflow.md](docs/offer-workflow.md): offer types, pricing, lifecycle, worker · [docs/moderation.md](docs/moderation.md): admin review guide
- [docs/authentication.md](docs/authentication.md) · [docs/authorization.md](docs/authorization.md) · [docs/database.md](docs/database.md)

## Contributing

- Work on a branch and open a pull request. CI must be green: lint, types, unit and integration tests, build.
- Every endpoint validates its input with a Zod schema, requires authentication unless marked `@Public()`, and checks permissions on the backend.
- Record significant technical decisions as a new ADR.
- Never commit `.env`, keys, tokens or credentials.
