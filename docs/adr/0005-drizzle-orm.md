# ADR-0005: Drizzle ORM instead of Prisma

- **Status:** Accepted
- **Date:** 2026-09-30

## Context
We need a strongly typed database layer with reviewable migrations. The most important queries are geospatial (PostGIS) and full-text search.

## Options considered
1. **Prisma.** Great developer experience, but PostGIS types are `Unsupported`, so every geo read or write needs raw SQL that loses type safety. It uses its own schema language and a separate query engine.
2. **Drizzle ORM.** Schema defined in TypeScript, SQL-like query builder, custom column types (PostGIS geography), and typed raw SQL fragments. Migrations are plain SQL files.
3. **Kysely.** An excellent typed query builder, but no schema or migration generation.
4. **TypeORM.** Mature, but weaker type safety and a history of migration problems.

## Decision
Drizzle ORM + drizzle-kit. Generated migrations are committed as SQL and reviewed like code. Hand-written SQL migrations (extensions, triggers, special indexes) sit alongside them.

## Consequences
- Geo and search queries stay typed and readable.
- The team writes closer to SQL, which is a good fit for the query-heavy discovery module.
- Drizzle's ecosystem is younger than Prisma's. We will pin versions.
