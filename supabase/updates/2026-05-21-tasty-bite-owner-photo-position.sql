-- 2026-05-21 — Tasty Bite Minooka: keep owner's face in frame
--
-- Photo at index 2 in Tasty Bite's photos[] array is owner-with-fries.jpg,
-- a portrait crop where his head sits above the center of the image. With
-- the default 'center' focal point the gallery thumbnail clipped him at the
-- chin. Pin that one cell to 'top' so the face is visible after the crop.
-- Other two photos (food spread, storefront) stay at 'center'.


UPDATE businesses
SET photo_positions = ARRAY['center', 'center', 'top']
WHERE id = '51e28746-b519-46fa-b9b1-f721297c5c68';


-- Verify
SELECT id, name, photos, photo_positions
FROM businesses
WHERE id = '51e28746-b519-46fa-b9b1-f721297c5c68';
