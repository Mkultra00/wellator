
-- Drop permissive demo policies and revoke public grants on sensitive tables.
-- All access now flows through server functions using the service role.

DO $$
DECLARE
  t text;
  sensitive text[] := ARRAY['patients','appointments','bills','eobs','insurance_profiles','call_logs','pt_feedback','scheduled_calls'];
  pol record;
BEGIN
  FOREACH t IN ARRAY sensitive LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- slots: keep public read for availability discovery, restrict writes to service role.
DROP POLICY IF EXISTS "demo open slots" ON public.slots;
REVOKE ALL ON public.slots FROM anon, authenticated;
GRANT SELECT ON public.slots TO anon, authenticated;
GRANT ALL ON public.slots TO service_role;
ALTER TABLE public.slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "slots public read" ON public.slots FOR SELECT TO anon, authenticated USING (true);
