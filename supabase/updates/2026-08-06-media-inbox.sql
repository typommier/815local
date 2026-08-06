-- 2026-08-06: Media inbox.
--
-- One home for graphics sent to Ty (email/text/Facebook) or uploaded through
-- the site, so they can be seen in one place (admin/media-inbox.html) and later
-- attached to a business, event, or deal. Managed only through the manage-media
-- edge function (service role); RLS is on with no policies, so the anon and
-- authenticated keys can't touch the table. Same fail-closed, server-side gate
-- as manage-business-photos.
--
-- Applied via Supabase MCP apply_migration (migration: create_media_inbox);
-- this file is the repo-side record.

CREATE TABLE IF NOT EXISTS public.media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL,
  public_url   text NOT NULL,
  source       text NOT NULL DEFAULT 'other'
                 CHECK (source IN ('email','text','facebook','instagram','site','other')),
  caption      text,
  business_id  uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  event_id     uuid REFERENCES public.events(id)     ON DELETE SET NULL,
  deal_id      uuid REFERENCES public.deals(id)      ON DELETE SET NULL,
  status       text NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new','assigned','archived')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS media_created_at_idx  ON public.media (created_at DESC);
CREATE INDEX IF NOT EXISTS media_business_id_idx ON public.media (business_id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('media-inbox', 'media-inbox', true)
ON CONFLICT (id) DO NOTHING;
