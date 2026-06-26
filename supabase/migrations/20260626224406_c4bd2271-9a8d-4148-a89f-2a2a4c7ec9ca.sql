
-- =========================================================================
-- AI VOICE CARE NAVIGATOR — DEMO SCHEMA
-- Demo mode: open RLS (anon read/write). Production would scope to auth.uid().
-- =========================================================================

CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  dob DATE NOT NULL,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  accessibility_notes TEXT,
  mock_phone TEXT,
  persona_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO anon, authenticated;
GRANT ALL ON public.patients TO service_role;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open patients" ON public.patients FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  location TEXT NOT NULL,
  accepts_insurance TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  npi_mock TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.providers TO anon, authenticated;
GRANT ALL ON public.providers TO service_role;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open providers" ON public.providers FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','held','booked','cancelled'))
);
CREATE INDEX idx_slots_provider_status ON public.slots(provider_id, status, starts_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.slots TO anon, authenticated;
GRANT ALL ON public.slots TO service_role;
ALTER TABLE public.slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open slots" ON public.slots FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.insurance_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  payer TEXT NOT NULL,
  plan TEXT,
  member_id TEXT,
  group_id TEXT,
  referral_required BOOLEAN NOT NULL DEFAULT false,
  copay_cents INTEGER
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_profiles TO anon, authenticated;
GRANT ALL ON public.insurance_profiles TO service_role;
ALTER TABLE public.insurance_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open insurance" ON public.insurance_profiles FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  slot_id UUID REFERENCES public.slots(id),
  starts_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  reason TEXT,
  insurance_snapshot JSONB,
  created_via TEXT NOT NULL DEFAULT 'voice_agent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_appts_patient ON public.appointments(patient_id, starts_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO anon, authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open appointments" ON public.appointments FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','disputed','sent_to_collections')),
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bills TO anon, authenticated;
GRANT ALL ON public.bills TO service_role;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open bills" ON public.bills FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.eobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  payer_paid_cents INTEGER NOT NULL DEFAULT 0,
  patient_responsibility_cents INTEGER NOT NULL DEFAULT 0,
  denial_reason TEXT,
  plain_language_summary TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eobs TO anon, authenticated;
GRANT ALL ON public.eobs TO service_role;
ALTER TABLE public.eobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open eobs" ON public.eobs FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.pt_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  pain_0_10 INTEGER CHECK (pain_0_10 BETWEEN 0 AND 10),
  mobility_change TEXT,
  adherence TEXT,
  comment TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pt_feedback TO anon, authenticated;
GRANT ALL ON public.pt_feedback TO service_role;
ALTER TABLE public.pt_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open pt_feedback" ON public.pt_feedback FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  scenario TEXT NOT NULL,
  agent_session_id TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  outcome TEXT,
  human_transfer_requested BOOLEAN NOT NULL DEFAULT false,
  transfer_reason TEXT
);
CREATE INDEX idx_calls_patient ON public.call_logs(patient_id, started_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_logs TO anon, authenticated;
GRANT ALL ON public.call_logs TO service_role;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open call_logs" ON public.call_logs FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.scheduled_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  scenario TEXT NOT NULL CHECK (scenario IN ('reminder','pt_followup','billing_checkin')),
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','skipped'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_calls TO anon, authenticated;
GRANT ALL ON public.scheduled_calls TO service_role;
ALTER TABLE public.scheduled_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open scheduled_calls" ON public.scheduled_calls FOR ALL USING (true) WITH CHECK (true);
