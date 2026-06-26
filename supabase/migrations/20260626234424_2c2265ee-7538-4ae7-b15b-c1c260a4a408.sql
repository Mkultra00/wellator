
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS distance_miles numeric(5,1);
UPDATE public.providers SET distance_miles = CASE id
  WHEN 'a1111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa' THEN 1.2
  WHEN 'a2222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa' THEN 3.4
  WHEN 'a3333333-aaaa-aaaa-aaaa-aaaaaaaaaaaa' THEN 6.8
  WHEN 'a4444444-aaaa-aaaa-aaaa-aaaaaaaaaaaa' THEN 4.1
  WHEN 'a5555555-aaaa-aaaa-aaaa-aaaaaaaaaaaa' THEN 5.5
  WHEN 'a6666666-aaaa-aaaa-aaaa-aaaaaaaaaaaa' THEN 2.7
  ELSE COALESCE(distance_miles, 5.0)
END;
