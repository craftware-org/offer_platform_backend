# ADR-0004: PostgreSQL + PostGIS as the primary datastore

- **Status:** Accepted
- **Date:** 2026-09-30

## Context
The core query is "active offers within X km of a point, filtered by category, text and price, ranked." The data is strongly relational (users ↔ businesses ↔ offers ↔ price history ↔ reports) and needs transactions and audit trails.

## Options considered
1. **PostgreSQL + PostGIS.** Industry-standard geospatial support, GiST indexes, full-text search, JSONB, transactions. Available as a managed service on every cloud.
2. **MySQL.** Weaker spatial and full-text features.
3. **MongoDB.** Has geo queries, but relational integrity and multi-document transactions are weaker for this domain.

## Decision
PostgreSQL 17 with PostGIS 3. Extensions: `postgis`, `pg_trgm`, `citext`, `unaccent`.
Locations are stored as `geography(Point, 4326)` (distance in metres) with GiST indexes. Full-text search uses a generated `tsvector` column with a GIN index.

## Consequences
- The managed database must support PostGIS. RDS, Cloud SQL, Azure, Supabase and Neon all do.
- One datastore covers relational, geo and search needs for the MVP. OpenSearch is deferred.
