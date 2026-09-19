-- 2026-09-19 security hardening
-- Apply in Supabase SQL editor on project kyneaettrynagavewefi.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'businesses','events','deals','reviews','profiles','blocked_emails','media',
        'claim_requests','advertise_waitlist','studio_inquiries','newsletter_subscribers'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE IF EXISTS public.blocked_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.blocked_emails FROM anon, authenticated, PUBLIC;
REVOKE ALL ON TABLE public.profiles FROM anon, authenticated, PUBLIC;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

ALTER TABLE IF EXISTS public.reviews ENABLE ROW LEVEL SECURITY;
DROP VIEW IF EXISTS public.reviews_public;
CREATE VIEW public.reviews_public AS
  SELECT id, business_id, reviewer_name, rating, review_text,
         helpful_count, review_source, created_at, is_flagged
  FROM public.reviews
  WHERE COALESCE(is_flagged, false) = false;
GRANT SELECT ON public.reviews_public TO anon, authenticated;
REVOKE SELECT ON TABLE public.reviews FROM anon;
REVOKE SELECT ON TABLE public.reviews FROM authenticated;
CREATE POLICY reviews_select_own ON public.reviews
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE IF EXISTS public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY businesses_public_insert ON public.businesses
  FOR INSERT TO anon, authenticated
  WITH CHECK (is_active IS FALSE AND COALESCE(is_featured, false) = false);
CREATE POLICY events_public_insert ON public.events
  FOR INSERT TO anon, authenticated
  WITH CHECK (is_active IS FALSE AND COALESCE(is_featured, false) = false);
CREATE POLICY deals_public_insert ON public.deals
  FOR INSERT TO anon, authenticated
  WITH CHECK (is_active IS FALSE);

CREATE POLICY businesses_public_select ON public.businesses
  FOR SELECT TO anon, authenticated
  USING (is_active IS TRUE);
CREATE POLICY events_public_select ON public.events
  FOR SELECT TO anon, authenticated
  USING (is_active IS TRUE);
CREATE POLICY deals_public_select ON public.deals
  FOR SELECT TO anon, authenticated
  USING (is_active IS TRUE);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['claim_requests','advertise_waitlist','studio_inquiries','newsletter_subscribers']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE SELECT, UPDATE, DELETE ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT INSERT ON TABLE public.%I TO anon, authenticated', t);
    EXECUTE format(
      'CREATE POLICY %I_public_insert ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (true)',
      t, t
    );
  END LOOP;
END $$;

ALTER TABLE IF EXISTS public.media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.media FROM anon, authenticated, PUBLIC;

DELETE FROM public.newsletter_subscribers
 WHERE email IN (
   'audit-probe-do-not-keep@example.com',
   'audit-probe@example.com'
 );

UPDATE storage.buckets
   SET public = false
 WHERE id = 'media-inbox';
