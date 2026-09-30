-- Search support for discovery (Phase 4, spec §9). Hand-written; not declared in the Drizzle schema
-- (queried with raw SQL in modules/discovery), so drizzle-kit never tries to change it.

-- Weighted full-text vector, maintained by PostgreSQL itself: title > item name > description.
-- 'english' stems English words ("shirts" matches "shirt"); other scripts are kept as-is.
ALTER TABLE offers ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english'::regconfig, coalesce(item_name, '')), 'B') ||
  setweight(to_tsvector('english'::regconfig, coalesce(description, '')), 'C')
) STORED;--> statement-breakpoint
CREATE INDEX offers_search_vector_gin ON offers USING gin (search_vector);--> statement-breakpoint

-- Trigram indexes: typo-tolerant similarity and fast ILIKE '%…%' matching in any script (e.g. Kannada).
CREATE INDEX offers_title_trgm ON offers USING gin (title gin_trgm_ops);--> statement-breakpoint
CREATE INDEX businesses_name_trgm ON businesses USING gin (name gin_trgm_ops);--> statement-breakpoint
CREATE INDEX localities_name_trgm ON localities USING gin (name gin_trgm_ops);
