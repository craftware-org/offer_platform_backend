# ADR-0002: Modular monolith with API + worker processes

- **Status:** Accepted
- **Date:** 2026-09-30

## Context
MVP scale is a single city. The team is small. The domain has clear sub-areas (auth, businesses, offers, discovery, notifications, …) that may need to scale or split later.

## Options considered
1. **Microservices.** Independent scaling, but distributed transactions, network failures, many deployables and heavy DevOps. Premature for an MVP.
2. **Unstructured monolith.** Fastest at first, but becomes tangled and is hard to split later.
3. **Modular monolith.** One deployable with strict internal module boundaries.

## Decision
Option 3. One codebase and one Docker image, run as two process types:
- `api`: handles HTTP requests, stateless, horizontally scalable.
- `worker`: runs scheduled and queued jobs (expiry, notifications, aggregation).

Boundary rules:
- Modules interact only through exported services, never through each other's repositories or tables.
- Side effects across modules use domain events plus queued jobs.
- **Exception:** `discovery` may read offer and business tables directly (read-only) for query performance. This is the one allowed cross-module read and is kept in `discovery/*.repository.ts`.

## Consequences
- Simple deploys and local development.
- If a module later needs to become a service (e.g. notifications), its boundary already exists.
- Boundary discipline has to be enforced in code review. A lint rule for import boundaries will be added in Phase 1.
