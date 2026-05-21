-- 2026-05-21 — Tasty Bite Minooka listing correction
--
-- Owner contacted 815local: the listing currently presents them as
-- Mediterranean / shawarma, but they are an American Chicago-style
-- establishment that also serves Greek-style gyros. Fix the subcategory
-- and description so visitors aren't misinformed.
--
-- HOW TO RUN
--   1. Open the Supabase SQL editor for project kyneaettrynagavewefi.
--   2. Run the PREVIEW SELECT below and confirm exactly one row returns
--      (Tasty Bite in Minooka). If more or zero rows return, STOP and
--      adjust the WHERE clause before running the UPDATE.
--   3. Run the BEGIN ... COMMIT block.
--   4. Run the VERIFICATION SELECT and confirm the new values.


-- 1) PREVIEW: confirm we're matching the right row
SELECT id, name, city, category, subcategory, description
FROM businesses
WHERE name ILIKE 'Tasty Bite%'
  AND city = 'Minooka';


-- 2) UPDATE (atomic — use ROLLBACK instead of COMMIT if preview was wrong)
BEGIN;

UPDATE businesses
SET
  subcategory = 'American & Greek',
  description = 'Family-owned Minooka establishment serving American Chicago-style cuisine alongside Greek-style gyros.',
  updated_at  = now()
WHERE name ILIKE 'Tasty Bite%'
  AND city = 'Minooka';

COMMIT;


-- 3) VERIFICATION: re-read the row and confirm new values
SELECT id, name, city, category, subcategory, description, updated_at
FROM businesses
WHERE name ILIKE 'Tasty Bite%'
  AND city = 'Minooka';
