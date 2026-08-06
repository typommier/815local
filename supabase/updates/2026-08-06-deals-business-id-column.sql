-- 2026-08-06: Add business_id to deals table.
--
-- submit/deal.html has always inserted a business_id, but the deals table
-- never had that column, so PostgREST rejected every submission (the table
-- had 0 rows, ever). Mirror the events table: a nullable FK to businesses,
-- set null on delete, plus an index for the deals page lookup that links a
-- deal back to its business listing.
--
-- Applied via Supabase MCP apply_migration (migration: add_business_id_to_deals);
-- this file is the repo-side record.

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS deals_business_id_idx ON public.deals(business_id);
