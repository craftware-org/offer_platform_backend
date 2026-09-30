# ADR-0001: Multiple repositories, OpenAPI as the contract

- **Status:** Superseded by [ADR-0010](0010-single-repo-monorepo.md)
- **Date:** 2026-09-30

## Context
The platform will have a backend, a customer website, a business portal, an admin panel, and later mobile apps. The product owner does not want everything in one repository. All clients must use the same API.

## Options considered
1. **Single monorepo** (all apps, shared packages). Easy to share types, but access control, CI and release cadence are tangled together, and the product owner explicitly doesn't want it.
2. **Multiple repos with a shared-types package.** Needs an internal package registry and version bumps across repos for every change. High friction.
3. **Multiple repos, OpenAPI spec as the contract.** The backend generates the spec from code, and clients generate typed clients from the spec.

## Decision
Option 3. Repos: `offer_platform_backend`, `offer_platform_web`, `offer_platform_admin`, `offer_platform_mobile`, `offer_platform_infra` (created when needed).

## Consequences
- The backend must keep OpenAPI output accurate. It is generated from the same Zod schemas that validate requests, so it can't drift.
- Breaking API changes need versioning (`/api/v2`) because mobile apps can't be force-updated.
- Each repo has independent CI and deploys. The admin panel can be deployed privately.
