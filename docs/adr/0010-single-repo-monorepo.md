# ADR-0010: Single repository (monorepo) — supersedes ADR-0001

- **Status:** Accepted
- **Date:** 2026-09-30
- **Supersedes:** [ADR-0001](0001-multi-repo-with-openapi-contract.md)

## Context
ADR-0001 proposed one repository per app. The product owner then asked for whatever is simplest to manage, most efficient and most reliable. The team is three people at Craftware, who build, host and operate the platform.

## Options considered
1. **Multiple repos (ADR-0001).** Per-repo access control, but a cross-app change needs several PRs and releases. API/client drift is caught late, and CI, secrets, branch protection and dependency updates are duplicated N times.
2. **Single repo with workspaces.** Atomic cross-app changes, shared schemas and types, one CI and one set of settings. Apps still build and deploy independently.

## Decision
Option 2. One repository (GitHub name kept as `craftware-org/offer_platform_backend` at the owner's request) using **pnpm workspaces** and **Turborepo** for task orchestration and caching.

```
apps/api      backend (NestJS)          — Phase 1
apps/web      public site + business portal (Next.js) — Phase 4
apps/admin    admin panel               — Phase 2+
apps/mobile   mobile app                — after web MVP
packages/*    shared code (e.g. API contract types) — added only when a second consumer exists
```

## Consequences
- The OpenAPI spec is still generated from `apps/api` and remains the public contract for mobile and any third party.
- CI runs only the tasks affected by a change (Turborepo), and each app has its own deploy pipeline.
- Everyone with repo access sees all app code. That is acceptable for this team.
- The repo name is historical and does not describe the contents. This is documented in the README.
