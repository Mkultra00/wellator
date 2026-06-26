## AI Voice Care Navigator — Hackathon Build Plan

End-to-end browser demo of all three patient journeys (new booking, PT follow-up, billing/insurance explainer) plus an admin dashboard. Voice via ElevenLabs Agent (real, your keys). Reasoning via Gemini (configured on the ElevenLabs Agent as custom LLM — outside this app). Patient identity via a "pick-a-patient" demo switcher (no auth friction).

### 1. Stack & infra
- TanStack Start + Tailwind + shadcn (existing template).
- Lovable Cloud (Supabase) for DB + storage + server functions.
- ElevenLabs `@elevenlabs/react` `useConversation` hook for the live voice widget; WebRTC connection via a server-minted conversation token.
- Server functions for every "tool" the agent calls (check_availability, book_appointment, etc.) — exposed both to the ElevenLabs agent (server/webhook tools) and to the demo UI for inspection.

### 2. Secrets
- `ELEVENLABS_API_KEY` — via ElevenLabs standard connector.
- `ELEVENLABS_AGENT_ID` — added as secret (you'll paste your Agent ID).
- Gemini key lives in the ElevenLabs Agent's custom-LLM config, not in this app.

### 3. Data model (Supabase, with grants + RLS)
- `patients` (id, full_name, dob, preferred_language, accessibility_notes, mock_phone)
- `providers` (id, name, specialty, location, npi_mock)
- `slots` (id, provider_id, starts_at, ends_at, status)
- `appointments` (id, patient_id, provider_id, slot_id, status, reason, insurance_snapshot jsonb, created_via)
- `insurance_profiles` (patient_id, payer, plan, member_id, group_id, referral_required, copay)
- `bills` (id, patient_id, appointment_id, amount_cents, status, line_items jsonb)
- `eobs` (id, bill_id, payer_paid_cents, patient_responsibility_cents, denial_reason)
- `pt_feedback` (id, patient_id, appointment_id, pain_0_10, mobility_change, adherence, comment)
- `call_logs` (id, patient_id, scenario, started_at, ended_at, transcript jsonb, agent_session_id, outcome)
- `scheduled_calls` (id, patient_id, scenario, due_at, status) — drives the mock dispatcher

Demo mode: open RLS (anon SELECT/INSERT/UPDATE) since there is no auth. Documented as demo-only; production hardening noted in README.

Seed migration: 5 patients (incl. elderly persona, post-stroke caregiver scenario, Spanish-preferred), 6 providers across 3 specialties/2 locations, 60 future slots, sample bills/EOBs/insurance, 2 scheduled follow-up calls.

### 4. Tool contracts (server functions)
JSON-schema-validated, each both callable as a server function and exposed as an ElevenLabs server (webhook) tool:
- `find_providers({ specialty, location, accepts_insurance? })`
- `check_availability({ provider_id, earliest_date, latest_date })`
- `book_appointment({ patient_id, slot_id, reason, insurance_snapshot })`
- `reschedule_appointment / cancel_appointment`
- `get_insurance_summary({ patient_id })`
- `get_billing_summary({ patient_id, bill_id? })` — returns plain-language EOB
- `record_pt_feedback({ patient_id, appointment_id, ... })`
- `log_call_turn({ session_id, role, text })` — streamed from the client onMessage
- `request_human_transfer({ patient_id, reason })` — flags in dashboard

All endpoints validated with Zod; written so swapping the mock dispatcher for Twilio is a single new caller.

### 5. Patient-facing UI (`/`)
- Demo-mode patient switcher in the header (dropdown of seeded patients) — sets `patient_id` in context + URL.
- Three large, high-contrast cards: "Book an appointment", "After-visit follow-up", "Help me understand a bill" — accessibility tuned (≥18px base, focus rings, no auto-timeouts, "repeat that" hint).
- "Start call" launches the ElevenLabs widget with dynamic variables: patient_id, patient_name, scenario, locale.
- Live transcript pane shows user/agent turns from `onMessage`; written to `call_logs`.
- Booking confirmation screen after `book_appointment` resolves.

### 6. Mock outbound call experience (`/inbox`)
- A "Scheduled calls" list pulled from `scheduled_calls`.
- "Answer" button shows a phone-style ringing UI then opens the same ElevenLabs session, preloaded with PT-follow-up or billing context.
- Exact same agent + tool contracts as inbound — the only swap for production is who places the call.

### 7. Admin/clinician dashboard (`/admin`)
- Tabs: Appointments, Calls (with transcripts), PT Feedback, Human transfer queue.
- Simple metrics row (mock-but-meaningful): bookings today, avg call duration, % escalated, no-show rate.
- Filterable by patient.

### 8. ElevenLabs agent setup (done in ElevenLabs dashboard — documented in README)
- Persona "Mara", slow pace, warm tone, barge-in enabled, low VAD threshold.
- System prompt with Section 7 guardrails baked in (never interpret results, always confirm before booking, offer transfer).
- Custom LLM → Gemini 3.5 Flash.
- Server tools point at the deployed Lovable Cloud server-function URLs.
- Dynamic variables: patient_id, patient_name, scenario, preferred_language.

### 9. Deliverables & demo script
- Working app at preview URL, all three journeys demoable in ~5 min.
- README with: env vars, ElevenLabs agent JSON export, swap-to-Twilio path, HIPAA/production gap list.
- Seeded demo data so a judge can pick any patient and run any scenario.

### Technical details / risks
- Voice latency budget: STT ~200ms + Gemini ~400ms + TTS ~200ms; if Gemini spikes, agent has a "let me check that for you" filler line.
- Booking race: `book_appointment` does a conditional update on `slots.status='open'` so two concurrent calls can't double-book.
- Transcript writes are batched (every committed turn) to avoid hammering the DB.
- Demo-mode open RLS is called out explicitly; production hardening (auth + per-patient policies) is one migration away.
- No Twilio, no payer APIs, no PHI — clearly labeled in the UI footer.

### Out of scope for this build
- Real telephony, real payer eligibility, real auth/HIPAA posture, multilingual TTS beyond what ElevenLabs voice supports out of the box, clinician-side write actions.

### What I need from you before building
- Your ElevenLabs Agent ID (I'll prompt for it via secret on the first build step).
- Confirm Gemini is already wired as the custom LLM on that agent (or you want me to leave the agent on ElevenLabs' default model for the demo).
