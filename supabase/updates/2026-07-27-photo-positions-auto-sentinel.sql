-- 2026-07-27 — photo_positions: '' means auto, and stay indexed to photos[]
--
-- Two problems this fixes.
--
-- 1. 'center' was a dead value. The admin picker defaulted to 'center' and
--    wrote it, so the listing page had no way to tell a deliberate center from
--    an untouched default. It resolved 'center' to 'top' instead, which meant
--    center was the one focal point you could never actually apply. Every
--    stored 'center' becomes '' (auto), which still renders 'top', so nothing
--    on the site changes appearance. From here on a saved 'center' is honored
--    literally, because auto has its own representation.
--
-- 2. photo_positions could drift out of alignment with photos. Eric McGill-
--    Realtor has 5 photos and 1 position. Any listing where the lengths
--    disagree silently applies the wrong focal point to the wrong photo (or
--    none at all). Pad with '' / truncate so index i always describes photos[i].
--
-- Auto resolves per surface, which keeps this migration visually invisible:
-- the listing gallery and homepage banner anchor to 'top' (exactly what a
-- stored 'center' already resolved to there), and cards, the spotlight and
-- nearby tiles stay on 'center' (exactly what they already showed). A stored
-- value, 'center' included, is honored literally everywhere. See
-- assets/js/photo-crop.js, which is now the single source of that rule.


-- 1. Retire 'center' as the implicit "untouched" marker.
UPDATE public.businesses
SET photo_positions = (
  SELECT COALESCE(array_agg(CASE WHEN p = 'center' THEN '' ELSE p END ORDER BY ord), '{}'::text[])
  FROM unnest(photo_positions) WITH ORDINALITY AS t(p, ord)
)
WHERE 'center' = ANY(photo_positions);


-- 2. Lock photo_positions length to photos length.
UPDATE public.businesses
SET photo_positions = (
  SELECT COALESCE(array_agg(COALESCE(photo_positions[i], '') ORDER BY i), '{}'::text[])
  FROM generate_series(1, COALESCE(array_length(photos, 1), 0)) AS i
)
WHERE COALESCE(array_length(photos, 1), 0) IS DISTINCT FROM COALESCE(array_length(photo_positions, 1), 0);


COMMENT ON COLUMN public.businesses.photo_positions IS
  'CSS background-position keyword for each entry in photos[], aligned by index and kept the same length. '''' means auto (no focal point picked), which the site renders as ''top''. A stored value, including ''center'', is honored exactly as saved. Set via admin/edit-business-photos.html; resolved by assets/js/photo-crop.js.';
