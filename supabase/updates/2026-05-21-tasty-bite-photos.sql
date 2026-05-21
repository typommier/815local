-- 2026-05-21 — Tasty Bite Minooka: add hero photo + gallery
--
-- Owner provided three photos via the 815local admin chat:
--   1. Overhead food spread (Italian beef / gyro / hot dog / burger / fries /
--      onion rings) — chosen as hero because it shows the full menu identity
--      at a glance and reinforces the "American Chicago + Greek gyros"
--      positioning corrected in 2026-05-21-tasty-bite-minooka.sql.
--   2. Storefront with "Tasty Bite — Gyros • Beef • Burgers" sign.
--   3. Staff member holding loaded gyro fries — humanizes the family-owned
--      angle.
--
-- Files were uploaded by typommier@gmail.com to the public `business-photos`
-- bucket under the business's id folder. This script wires image_url + photos
-- to those public URLs.


UPDATE businesses
SET
  image_url = 'https://kyneaettrynagavewefi.supabase.co/storage/v1/object/public/business-photos/51e28746-b519-46fa-b9b1-f721297c5c68/hero-food-spread.jpg',
  photos = ARRAY[
    'https://kyneaettrynagavewefi.supabase.co/storage/v1/object/public/business-photos/51e28746-b519-46fa-b9b1-f721297c5c68/hero-food-spread.jpg',
    'https://kyneaettrynagavewefi.supabase.co/storage/v1/object/public/business-photos/51e28746-b519-46fa-b9b1-f721297c5c68/storefront.jpg',
    'https://kyneaettrynagavewefi.supabase.co/storage/v1/object/public/business-photos/51e28746-b519-46fa-b9b1-f721297c5c68/owner-with-fries.jpg'
  ]
WHERE id = '51e28746-b519-46fa-b9b1-f721297c5c68';


-- Verify
SELECT id, name, image_url, photos
FROM businesses
WHERE id = '51e28746-b519-46fa-b9b1-f721297c5c68';
