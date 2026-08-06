-- 2026-08-06: Add image_url to deals.
--
-- Lets a deal carry a flyer/graphic (e.g. the promo image a business sends in),
-- rendered on the deal card on pages/deals.html. Nullable: deals without an
-- image render as text, exactly as before. Set from the admin Media Inbox
-- (attach an inbox image to a deal) via the manage-media edge function.
--
-- Applied via Supabase MCP apply_migration (migration: add_image_url_to_deals);
-- this file is the repo-side record.

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS image_url text;
