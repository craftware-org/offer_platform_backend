-- Load-test data (Phase 9): 300 verified shops in Hubballi and Dharwad with 10 live offers each
-- (3,000 offers), with varied titles, categories, prices and locations, so search and "near me"
-- work on a realistic amount of data. LOCAL TEST DATABASES ONLY: never run it on the preview or
-- production. Every row it creates has a slug starting with "load-"; remove them with cleanup.sql.
--   docker compose exec -T postgres psql -U offer_platform -d offer_platform -v ON_ERROR_STOP=1 < apps/api/test/load/seed.sql
\set ON_ERROR_STOP on

DO $$
BEGIN
  -- Guard: the browser tests' e2e accounts exist only in local and CI databases.
  IF NOT EXISTS (SELECT 1 FROM users WHERE email LIKE '%@e2e.test') THEN
    RAISE EXCEPTION 'No e2e test accounts found: this does not look like a local test database. Aborting.';
  END IF;
END $$;

BEGIN;

CREATE TEMP TABLE load_products(name text) ON COMMIT DROP;
INSERT INTO load_products VALUES
  ('Running shoes'), ('Cotton saree'), ('Silk saree'), ('Smartphone'), ('Laptop bag'), ('Wall clock'),
  ('LED TV'), ('Mixer grinder'), ('Pressure cooker'), ('School bag'), ('Gold earrings'), ('Leather wallet'),
  ('Sunglasses'), ('Wrist watch'), ('Bluetooth speaker'), ('Headphones'), ('Basmati rice'), ('Sweets box'),
  ('Dry fruits'), ('Birthday cake'), ('Pizza combo'), ('Chicken biryani'), ('Haircut'), ('Facial'),
  ('Gym membership'), ('Yoga classes'), ('Car wash'), ('Bike service'), ('AC service'), ('Formal shirt'),
  ('Denim jeans'), ('Kurta set'), ('Lehenga'), ('Sandals'), ('Formal shoes'), ('Tiffin box'),
  ('Water bottle'), ('Notebook set'), ('Toy car'), ('Ceiling fan');

CREATE TEMP TABLE load_words(word text) ON COMMIT DROP;
INSERT INTO load_words VALUES
  ('Festive'), ('Diwali'), ('Weekend'), ('Clearance'), ('New arrival'), ('Combo'), ('Mega'), ('Season end'),
  ('Special'), ('Family');

-- Shops: owner = the first e2e account, a random leaf category, a location within ~5 km of the
-- Hubballi or Dharwad centre.
WITH owner AS (SELECT id FROM users WHERE email LIKE '%@e2e.test' ORDER BY created_at LIMIT 1),
leaf AS (SELECT id, row_number() OVER (ORDER BY slug) AS n, count(*) OVER () AS total
         FROM categories c WHERE NOT EXISTS (SELECT 1 FROM categories k WHERE k.parent_id = c.id)),
shops AS (
  SELECT g AS n, gen_random_uuid() AS id FROM generate_series(1, 300) g
)
INSERT INTO businesses (id, owner_user_id, name, slug, category_id, phone, status, submitted_at, verified_at)
SELECT s.id, (SELECT id FROM owner),
       'Load Shop ' || s.n || ' ' || (SELECT name FROM load_products ORDER BY random() + s.n * 0 LIMIT 1),
       'load-shop-' || s.n,
       (SELECT id FROM leaf WHERE leaf.n = 1 + (s.n % leaf.total)),
       '+9190000' || lpad(s.n::text, 5, '0'), 'VERIFIED', now() - interval '20 days', now() - interval '19 days'
FROM shops s;

INSERT INTO business_locations (id, business_id, is_primary, address_line1, city_id, location)
SELECT gen_random_uuid(), b.id, true, 'Shop ' || split_part(b.slug, '-', 3) || ', Main Road', c.id,
       ST_SetSRID(ST_MakePoint(
         CASE WHEN c.slug = 'hubballi' THEN 75.1240 ELSE 75.0078 END + (random() - 0.5) * 0.09,
         CASE WHEN c.slug = 'hubballi' THEN 15.3647 ELSE 15.4589 END + (random() - 0.5) * 0.09), 4326)::geography
FROM businesses b
JOIN cities c ON c.slug = CASE WHEN split_part(b.slug, '-', 3)::int % 3 = 0 THEN 'dharwad' ELSE 'hubballi' END
WHERE b.slug LIKE 'load-shop-%';

-- Offers: 10 per shop, percentage off or price drop, live for the next 30 days, approved at
-- different times in the last two weeks (ranking uses freshness).
INSERT INTO offers (id, business_id, slug, type, title, category_id, original_price, offer_price, discount_percent,
                    starts_at, expires_at, status, submitted_at, approved_at, first_published_at)
SELECT gen_random_uuid(), b.id, 'load-offer-' || split_part(b.slug, '-', 3) || '-' || k,
       (CASE WHEN k % 2 = 0 THEN 'PERCENTAGE_OFF' ELSE 'PRICE_DROP' END)::offer_type,
       w.word || ' ' || p.name || ' offer',
       b.category_id, price, price * (100 - pct) / 100, pct,
       now() - interval '1 day', now() + interval '30 days', 'ACTIVE',
       now() - interval '15 days', now() - (random() * interval '14 days'), now() - interval '14 days'
FROM businesses b
CROSS JOIN generate_series(1, 10) k
CROSS JOIN LATERAL (SELECT name FROM load_products ORDER BY random() + k * 0 + length(b.slug) * 0 LIMIT 1) p
CROSS JOIN LATERAL (SELECT word FROM load_words ORDER BY random() + k * 0 + length(b.slug) * 0 LIMIT 1) w
CROSS JOIN LATERAL (SELECT (50000 + floor(random() * 500000) + k * 0 + length(b.slug) * 0)::bigint AS price,
                           (10 + floor(random() * 50) + k * 0 + length(b.slug) * 0)::int AS pct) v
WHERE b.slug LIKE 'load-shop-%';

COMMIT;

ANALYZE businesses; ANALYZE business_locations; ANALYZE offers;
SELECT count(*) AS load_shops FROM businesses WHERE slug LIKE 'load-shop-%';
SELECT count(*) AS load_offers FROM offers WHERE slug LIKE 'load-offer-%';
