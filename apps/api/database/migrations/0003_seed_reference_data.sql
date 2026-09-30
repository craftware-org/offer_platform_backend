-- Initial reference data. Runs once; afterwards admins manage cities, localities and categories
-- through the admin API (so these rows may be edited or disabled later).

-- Launch market: Hubballi-Dharwad, Karnataka. Centres are approximate city-centre coordinates;
-- business map pins must fall within service_radius_km of their city's centre.
INSERT INTO cities (id, name, slug, state, country_code, timezone, center, service_radius_km) VALUES
  (gen_random_uuid(), 'Hubballi', 'hubballi', 'Karnataka', 'IN', 'Asia/Kolkata', 'SRID=4326;POINT(75.1240 15.3647)'::geography, 25),
  (gen_random_uuid(), 'Dharwad',  'dharwad',  'Karnataka', 'IN', 'Asia/Kolkata', 'SRID=4326;POINT(75.0078 15.4589)'::geography, 25);
--> statement-breakpoint

-- Initial categories (from the product specification): category → subcategories.
INSERT INTO categories (id, parent_id, name, slug, sort_order) VALUES
  (gen_random_uuid(), NULL, 'Shopping',    'shopping',    1),
  (gen_random_uuid(), NULL, 'Food',        'food',        2),
  (gen_random_uuid(), NULL, 'Services',    'services',    3),
  (gen_random_uuid(), NULL, 'Experiences', 'experiences', 4);
--> statement-breakpoint

INSERT INTO categories (id, parent_id, name, slug, sort_order)
SELECT gen_random_uuid(), p.id, c.name, c.slug, c.sort_order
FROM (VALUES
  ('shopping',    'Fashion',          'fashion',            1),
  ('shopping',    'Footwear',         'footwear',           2),
  ('shopping',    'Electronics',      'electronics',        3),
  ('shopping',    'Mobile',           'mobile',             4),
  ('shopping',    'Jewellery',        'jewellery',          5),
  ('shopping',    'Home & Furniture', 'home-and-furniture', 6),
  ('shopping',    'Grocery',          'grocery',            7),
  ('food',        'Restaurants',      'restaurants',        1),
  ('food',        'Cafes',            'cafes',              2),
  ('food',        'Bakeries',         'bakeries',           3),
  ('food',        'Fast Food',        'fast-food',          4),
  ('services',    'Salons',           'salons',             1),
  ('services',    'Beauty',           'beauty',             2),
  ('services',    'Fitness',          'fitness',            3),
  ('services',    'Education',        'education',          4),
  ('services',    'Repairs',          'repairs',            5),
  ('services',    'Automotive',       'automotive',         6),
  ('experiences', 'Hotels',           'hotels',             1),
  ('experiences', 'Travel',           'travel',             2),
  ('experiences', 'Events',           'events',             3),
  ('experiences', 'Entertainment',    'entertainment',      4)
) AS c(parent_slug, name, slug, sort_order)
JOIN categories p ON p.slug = c.parent_slug;
