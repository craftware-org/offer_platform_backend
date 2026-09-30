# ADR-0007: Redis + BullMQ for jobs, cache and rate limiting

- **Status:** Accepted
- **Date:** 2026-09-30

## Context
Offer activation and expiry must happen reliably without client involvement. Notifications and analytics aggregation should run outside the request path. OTP and API endpoints need distributed rate limiting.

## Options considered
1. **In-process cron (node-cron).** Runs in every API instance, which duplicates work as we scale. Jobs are lost on crash.
2. **Postgres-based queue (pg-boss).** One fewer piece of infrastructure, but we need Redis anyway for rate limiting and cache.
3. **Redis + BullMQ.** Repeatable (cron) jobs, retries with backoff, and one-at-a-time locking, all built in.

## Decision
Redis serves three roles: BullMQ job queue, cache, and rate-limit counters. Jobs run only in the `worker` process.

## Implementation note (2026-09-30, Phase 1)
Local development and tests use **Valkey 8** (the open-source, protocol-compatible Redis fork that AWS ElastiCache offers), so development matches production. The client is `ioredis`. BullMQ 6 supports it and will be added with the first background job (offer expiry, Phase 3). Phase 1 uses Redis only for rate limiting.

## Implementation note (2026-09-30, Phase 3)
BullMQ 6 is now used. The `worker` process (`src/worker.ts`, `WorkerModule`) registers an idempotent job scheduler (`upsertJobScheduler`, every `OFFER_LIFECYCLE_INTERVAL_MS`) for offer activation and expiry. BullMQ 6 defines its own connection option types, and connections are built from `REDIS_URL` with `maxRetriesPerRequest: null`. The API process does not use BullMQ yet.

## Consequences
- Redis is required in every environment (a Docker container locally, a managed service in production).
- Jobs must be idempotent (conditional `UPDATE … WHERE status = … AND expires_at <= now()`).
- Correctness never depends on job timing alone: discovery queries also filter by `expires_at`.
