-- 2026-08-29 — Add Forepaws (Minooka) to the directory
--
-- Source: https://www.forepawspets.com/ and the store about pages.
-- Locally owned pet supply store at 453 S Ridge Rd, Minooka.
-- No photos in this insert (principle: hide missing photos, do not invent them).
--
-- HOW TO RUN
--   1. Open the Supabase SQL editor for project kyneaettrynagavewefi.
--   2. Run the PREVIEW SELECT. Expect zero rows. If a Forepaws row already
--      exists, STOP.
--   3. Run the INSERT.
--   4. Run the VERIFICATION SELECT.


-- 1) PREVIEW: confirm Forepaws is not already listed
SELECT id, name, city, address, phone, website, is_active, is_locally_owned
FROM businesses
WHERE name ILIKE '%forepaw%'
   OR website ILIKE '%forepawspets%'
   OR phone ILIKE '%456-7899%'
   OR phone ILIKE '%4567899%';


-- 2) INSERT
INSERT INTO businesses (
  name,
  category,
  subcategory,
  description,
  address,
  city,
  state,
  zip,
  phone,
  website,
  price_range,
  hours,
  features,
  is_active,
  is_featured,
  is_locally_owned,
  is_claimed,
  story
) VALUES (
  'Forepaws',
  'Retail & Shops',
  'Pet Supply Store',
  'Locally owned Minooka pet supply store specializing in all-natural, American-made foods, treats, chews, toys, and grooming supplies for dogs, cats, birds, small pets, and reptiles. Two self-wash stations (an elevator tub and a walk-in shower), an in-store adoptable cat room partnered with Joliet Township Animal Control, nail trims for cats, small animals, and reptiles, and caged-pet sitting.',
  '453 S Ridge Rd',
  'Minooka',
  'IL',
  '60447',
  '(779) 456-7899',
  'www.forepawspets.com',
  '$$',
  '{
    "monday": "9:00 AM - 7:00 PM",
    "tuesday": "9:00 AM - 7:00 PM",
    "wednesday": "9:00 AM - 7:00 PM",
    "thursday": "9:00 AM - 7:00 PM",
    "friday": "9:00 AM - 7:00 PM",
    "saturday": "9:00 AM - 7:00 PM",
    "sunday": "9:00 AM - 7:00 PM"
  }'::jsonb,
  ARRAY['Locally Owned','Dog Friendly','Cards Accepted','Walk-ins Welcome','Free Parking'],
  true,
  false,
  true,
  false,
  'Owned by Megan Kurzweil, who has worked in kennels, rescues, pet training, breeding, and as a veterinary technician for more than 25 years. Forepaws opened in November 2015 and moved to 453 S Ridge Rd in October 2021. The store is picky about brands and does not carry products with artificial colors, flavors, by-products, or corn. The cat room fosters cats and kittens from Joliet Township Animal Control and sees about 350 adoptions a year.'
);


-- 3) VERIFICATION
SELECT id, name, city, address, phone, website, category, subcategory,
       is_active, is_locally_owned, is_featured, features, hours
FROM businesses
WHERE name = 'Forepaws'
  AND city = 'Minooka';
