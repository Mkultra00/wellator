# Mara

AI voice care coordinator for elderly patients. Mara calls doctor offices, negotiates appointments around the patient's preferences, and explains bills and insurance in plain language — all through voice.

> Hackathon demo. Mock data and simulated calls only — no real PHI or live telephony.

---

## What problem it solves

Older patients often need multiple specialists, each with different offices, locations, hours, and insurance rules. Making those calls means repeating insurance details, explaining referrals, comparing times, and tracking conflicting appointments. Mara handles that paperwork and phone-work for them.

## Why it matters

- **For patients:** Less confusion, fewer missed appointments, and no need to hold on hold or play phone tag.
- **For caregivers / care coordinators:** One place for the patient's insurance, PCP, address, and preferences instead of manual cross-checking.
- **For health systems:** Fewer no-shows and automatic escalation to a human when Mara can't book anything.

## How it works

1. A patient is selected from the dropdown.
2. They tap **Book an appointment** and pick providers from a referral network clustered by specialty.
3. They set preferences: days of the week, times of day, distance, and notes.
4. Mara batch-calls each office, negotiates exact appointment times, and avoids same-day scheduling conflicts.
5. The patient confirms the final plan; addresses and reminder toggles are shown.
6. The **Scheduled calls** inbox keeps transcripts and statuses for the current session.
7. The **Dashboard** lets admins manage the provider list and referral network.

## How AI powers it

| Layer | Role |
|-------|------|
| **Live voice agent** | ElevenLabs Conversational AI for "Talk to Mara," with vision support for uploaded documents or screenshots. |
| **Booking dialogs** | LLM generates turn-by-turn conversations between Mara and each office. Prefers **Baseten (`deepseek-ai/DeepSeek-V3.2`)**; falls back to **Lovable AI Gateway (`google/gemini-2.5-flash`)**. |
| **Voice playback** | ElevenLabs TTS speaks Mara and each office with distinct voices, sequenced so they never talk over each other. |
| **Scheduling logic** | Exact clock-time slots are parsed and a 60-minute same-day spacing rule is enforced; conflicting offers trigger an automatic recall. |
| **Context memory** | Patient insurance, PCP, address, and already-booked slots are carried across every call. |

## Tech stack

- TanStack Start + React + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (Lovable Cloud)
- ElevenLabs Conversational AI & TTS
- Baseten / Lovable AI Gateway for LLM inference

## Running locally

```bash
bun install
bun dev
```

The app runs on `http://localhost:8080` by default.

## Environment variables

Required keys are managed through Lovable Secrets:

- `BASETEN_API_KEY` — optional; enables Baseten-hosted LLM
- `ELEVENLABS_API_KEY` — for voice agent and TTS
- `LOVABLE_API_KEY` — for the fallback Lovable AI Gateway

---

## Team

- Frank Yu
- Forrest Pan
- Jitender Thakur

---

Built as a demo for Mara — AI Care Navigator.
