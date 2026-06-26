
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS clinic_address text,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;

-- Seed providers with addresses + coords (San Francisco area)
UPDATE public.providers SET
  clinic_address = COALESCE(clinic_address, '1 Embarcadero Center, San Francisco, CA'),
  latitude = COALESCE(latitude, 37.7946),
  longitude = COALESCE(longitude, -122.3999)
WHERE clinic_address IS NULL;

-- Spread coords a little using id hash so they're not identical
UPDATE public.providers
SET
  latitude = 37.75 + (abs(hashtext(id::text)) % 100) / 1000.0,
  longitude = -122.45 + (abs(hashtext(id::text || 'x')) % 100) / 1000.0
WHERE latitude = 37.7946;

-- Seed patient addresses (general neighborhoods)
UPDATE public.patients
SET
  address = COALESCE(address, 'Mission District, San Francisco, CA'),
  latitude = COALESCE(latitude, 37.7599 + (abs(hashtext(id::text)) % 50) / 1000.0),
  longitude = COALESCE(longitude, -122.4148 + (abs(hashtext(id::text || 'y')) % 50) / 1000.0)
WHERE address IS NULL;
