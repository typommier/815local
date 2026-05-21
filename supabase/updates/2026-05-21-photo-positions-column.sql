-- 2026-05-21 — Per-photo crop position support
--
-- Adds an optional, per-photo CSS background-position keyword aligned by
-- index with the existing photos[] array. Lets us keep faces/signage in
-- frame when the gallery crops a portrait or off-center photo. Empty array
-- (the default for every existing row) preserves current behavior ('center'
-- on every cell), so this is a non-breaking additive change.
--
-- The businesses_with_ratings view is recreated to expose the new column to
-- the homepage / directory / new-openings pages, which all read from that
-- view. Column is appended at the end (CREATE OR REPLACE VIEW can't insert
-- columns in the middle).


ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS photo_positions text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.businesses.photo_positions IS
  'Optional CSS background-position keyword (e.g. ''top'', ''bottom'', ''left top'') for each entry in photos[], aligned by index. Empty or missing entry => default ''center''. Used so portrait photos (faces, signage) keep their focal point in the cropped frame.';


CREATE OR REPLACE VIEW public.businesses_with_ratings AS
SELECT
  b.id,
  b.name,
  b.category,
  b.subcategory,
  b.description,
  b.address,
  b.city,
  b.state,
  b.zip,
  b.phone,
  b.website,
  b.price_range,
  b.hours,
  b.features,
  b.image_url,
  b.photos,
  b.is_featured,
  b.is_active,
  b.is_locally_owned,
  b.is_claimed,
  b.created_at,
  b.google_place_id,
  b.order_url,
  COALESCE(round(avg(r.rating), 1), 0::numeric) AS avg_rating,
  count(r.id)::integer AS review_count,
  b.story,
  b.photo_positions
FROM businesses b
LEFT JOIN reviews r ON r.business_id = b.id
GROUP BY b.id;
