
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS primary_provider_id uuid REFERENCES public.providers(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.provider_referrals (
  primary_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  specialist_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  PRIMARY KEY (primary_id, specialist_id)
);
GRANT SELECT ON public.provider_referrals TO anon, authenticated;
GRANT ALL ON public.provider_referrals TO service_role;
ALTER TABLE public.provider_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open referrals" ON public.provider_referrals FOR SELECT USING (true);

-- Mark primaries
UPDATE public.providers SET is_primary = true WHERE specialty = 'Primary Care';

-- Assign patient primaries
UPDATE public.patients SET primary_provider_id = 'a1111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  WHERE id IN ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444');
UPDATE public.patients SET primary_provider_id = 'a5555555-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  WHERE id IN ('22222222-2222-2222-2222-222222222222','55555555-5555-5555-5555-555555555555');

-- Each PCP refers all specialists in the demo set
INSERT INTO public.provider_referrals (primary_id, specialist_id)
SELECT pcp.id, spec.id
FROM public.providers pcp
CROSS JOIN public.providers spec
WHERE pcp.is_primary = true AND spec.is_primary = false
ON CONFLICT DO NOTHING;
