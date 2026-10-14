-- Removes the load-test data created by seed.sql (local test databases only), together with
-- anything that points at it (views, taps, saves, follows, reports, daily totals).
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE load_offers ON COMMIT DROP AS SELECT id FROM offers WHERE slug LIKE 'load-offer-%';
CREATE TEMP TABLE load_shops ON COMMIT DROP AS SELECT id FROM businesses WHERE slug LIKE 'load-shop-%';
DELETE FROM analytics_daily WHERE offer_id IN (SELECT id FROM load_offers) OR business_id IN (SELECT id FROM load_shops);
DELETE FROM analytics_events WHERE offer_id IN (SELECT id FROM load_offers) OR business_id IN (SELECT id FROM load_shops);
DELETE FROM reports WHERE offer_id IN (SELECT id FROM load_offers) OR business_id IN (SELECT id FROM load_shops);
DELETE FROM saved_offers WHERE offer_id IN (SELECT id FROM load_offers) OR business_id IN (SELECT id FROM load_shops);
DELETE FROM business_followers WHERE business_id IN (SELECT id FROM load_shops);
DELETE FROM offer_images WHERE offer_id IN (SELECT id FROM load_offers);
DELETE FROM offer_price_history WHERE offer_id IN (SELECT id FROM load_offers);
DELETE FROM offers WHERE id IN (SELECT id FROM load_offers);
DELETE FROM business_images WHERE business_id IN (SELECT id FROM load_shops);
DELETE FROM business_staff WHERE business_id IN (SELECT id FROM load_shops);
DELETE FROM business_locations WHERE business_id IN (SELECT id FROM load_shops);
DELETE FROM businesses WHERE id IN (SELECT id FROM load_shops);
COMMIT;
