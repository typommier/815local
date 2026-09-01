-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Anon key cannot UPDATE events (RLS). This is the admin path.
-- Uses photos already stored on 815local listings. No stock images.

update events
set
  image_url = 'https://kyneaettrynagavewefi.supabase.co/storage/v1/object/public/business-photos/9039879e-ca67-4e20-a773-09b4f18b60d5/3f5cdf38b77ddee7.jpg',
  business_id = '9039879e-ca67-4e20-a773-09b4f18b60d5'
where title = 'Aces Friday Night Cruise';

update events
set
  image_url = 'https://kyneaettrynagavewefi.supabase.co/storage/v1/object/public/business-photos/498736c5-ade0-49ba-abeb-e9112207d24c/Aux%20Sable.jpg',
  business_id = '498736c5-ade0-49ba-abeb-e9112207d24c'
where title = 'Splash pads through Labor Day';

update events
set
  image_url = 'https://kyneaettrynagavewefi.supabase.co/storage/v1/object/public/business-photos/7d18445f-d42e-43ae-adaf-9696afb54579/167c66182e569f12.jpg',
  business_id = '7d18445f-d42e-43ae-adaf-9696afb54579'
where title = 'Bark in the Park';

-- Sanity check. image_url should be set on those three.
select id, title, event_date, image_url is not null as has_photo
from events
where title in (
  'Aces Friday Night Cruise',
  'Splash pads through Labor Day',
  'Bark in the Park'
)
order by event_date;
