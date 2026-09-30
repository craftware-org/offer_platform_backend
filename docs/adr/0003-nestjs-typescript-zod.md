# ADR-0003: Node.js + TypeScript + NestJS, Zod for validation and OpenAPI

- **Status:** Accepted
- **Date:** 2026-09-30

## Context
Needs: a typed, maintainable backend; strong structure for ~14 modules; a generated OpenAPI spec; a large hiring pool in India; and the same language as the planned web and mobile clients.

## Options considered
1. **Express + TypeScript.** Minimal and familiar, but no structure, dependency injection or module system. Every project reinvents these, and consistency depends on discipline.
2. **Fastify + TypeScript.** Faster and has schema support, but still unstructured at application scale.
3. **NestJS (TypeScript).** Modules, dependency injection, guards (authorization), interceptors, OpenAPI tooling, first-class testing. Runs on Express or Fastify underneath.
4. **Django + GeoDjango (Python).** Excellent PostGIS support and a free admin UI, but a different language from all clients.
5. **Go.** Fast and cheap to run, but slower for CRUD-heavy product work and a smaller talent pool.

## Decision
**NestJS on the Express adapter, TypeScript strict mode, Node.js 24 LTS.**
- Express adapter over Fastify: broader middleware compatibility (uploads, security, rate limiting). The database, not the HTTP layer, will be the bottleneck.
- **Zod** is the single schema language. One schema per endpoint validates input, types the handler, and generates the OpenAPI spec. This replaces NestJS's default `class-validator`, which duplicates types and drifts from docs.

## Implementation note (2026-09-30, Phase 1)
NestJS 12 (the current major version) validates [Standard Schema](https://standardschema.dev/) schemas natively: `@Body({ schema })` together with the built-in `StandardSchemaValidationPipe`. Its Swagger module also turns those schemas into OpenAPI. Zod 4 implements Standard Schema, so the third-party `nestjs-zod` package is **not needed**. The decision (Zod as the single schema language) is unchanged; one dependency fewer. NestJS 12 also requires TypeScript 6.x (7.x is not yet supported by its tooling) and ships ES modules only.

## Consequences
- NestJS has a learning curve (decorators, dependency injection) for developers who only know Express.
- Nest's module system maps directly to ADR-0002 boundaries.
- Business logic lives in plain TypeScript (services, pure functions) and stays unit-testable without Nest.
