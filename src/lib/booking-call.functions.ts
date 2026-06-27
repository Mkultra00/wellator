/**
 * Server functions for the simulated batch booking calls.
 * - generateBookingDialog: Gemini 3.5 Flash via Lovable AI Gateway produces a
 *   turn-by-turn dialog between Mara and a doctor's office receptionist plus
 *   an outcome.
 * - synthesizeVoice: ElevenLabs TTS for a single line; returns base64 mp3.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MARA_VOICE = "EXAVITQu4vr4xnSDxMaL"; // Sarah
const OFFICE_VOICE_POOL = [
  "JBFqnCBsd6RMkjVDRZzb", // George
  "onwK4e9ZLuTAKqWW03F9", // Daniel
  "nPczCjzI2devNBz1zQrb", // Brian
  "XrExE9yKIg1WjnnlVkGX", // Matilda
  "cgSgspJ2msm6clMCkdW9", // Jessica
  "FGY2WhTYpPnrIDTdsKH5", // Laura
  "iP95p4xoKVk53GoZ742B", // Chris
  "pFZP5JQG7iQjIQuC4Bku", // Lily
];

export function pickOfficeVoice(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return OFFICE_VOICE_POOL[Math.abs(h) % OFFICE_VOICE_POOL.length];
}

export const MARA_VOICE_ID = MARA_VOICE;

const DialogInput = z.object({
  patient_name: z.string(),
  provider_name: z.string(),
  provider_specialty: z.string(),
  provider_location: z.string(),
  referring_doctor: z.string().nullable().optional(),
  insurance: z
    .object({
      payer: z.string().nullable().optional(),
      plan: z.string().nullable().optional(),
      member_id: z.string().nullable().optional(),
      group_id: z.string().nullable().optional(),
      referral_required: z.boolean().nullable().optional(),
    })
    .nullable()
    .optional(),
  preferences: z.object({
    preferred_locations: z.string().optional().nullable(),
    days: z.array(z.string()).optional().default([]),
    time_of_day: z.string().optional().nullable(),
    max_distance_miles: z.number().optional().nullable(),
    notes: z.string().optional().nullable(),
  }),
  recall_reason: z.string().optional().nullable(),
  previous_slot: z.string().optional().nullable(),
});


export type DialogTurn = { speaker: "mara" | "office"; text: string };
export type PrepItem = {
  /** e.g. "Bring photo ID and insurance card", "Fasting bloodwork (LabCorp)", "Chest X-ray within 30 days" */
  text: string;
  /** how the patient handles it */
  category:
    | "bring" // bring with you (ID, list of meds, paperwork)
    | "pcp_send" // ask primary care to fax / send records or referral
    | "lab" // bloodwork — bookable
    | "imaging" // x-ray, MRI, CT — bookable
    | "cardiac" // EKG, stress test — bookable
    | "in_office" // specialist will do it in office, no action needed
    | "other";
  /** true when the patient needs a separate appointment to get it done */
  bookable: boolean;
};
export type DialogOutcome =
  | { kind: "offered"; slot: string; prep?: PrepItem[] }
  | { kind: "voicemail" }
  | { kind: "no_availability" };

export const generateBookingDialog = createServerFn({ method: "POST" })
  .inputValidator((d) => DialogInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const prefs = data.preferences;
    const prefLine = `Preferred ${prefs.time_of_day ?? "any time"} on ${
      (prefs.days ?? []).join(", ") || "any weekday"
    }, within ${prefs.max_distance_miles ?? "any"} miles${
      prefs.preferred_locations ? ` near ${prefs.preferred_locations}` : ""
    }${prefs.notes ? `. Notes: ${prefs.notes}` : ""}`;

    const system = `You generate realistic short phone-call transcripts between Mara (an AI care navigator calling on behalf of a patient) and a receptionist at a doctor's office. Output ONLY valid JSON matching: {"turns":[{"speaker":"mara"|"office","text":"..."}], "outcome": {"kind":"offered","slot":"...","prep":[{"text":"...","category":"bring"|"pcp_send"|"lab"|"imaging"|"cardiac"|"in_office"|"other","bookable":true|false}]} | {"kind":"voicemail"} | {"kind":"no_availability"}}. 6-12 turns. Natural, concise spoken lines (1-2 sentences each). In her OPENING turn Mara must: identify herself as an AI care navigator, name the patient, name the referring primary care doctor (if provided), and state the patient's insurance payer + plan (if provided). Then request an appointment matching preferences. If this is a CALLBACK (the user prompt will say so), Mara opens by saying she's calling back about the previously offered slot, explains the patient asked to reschedule and gives the reason (day vs time), and asks for an alternative that fits. When the office OFFERS a slot, BEFORE the call wraps Mara must ask: "Is there anything the patient should bring or have done before the visit — referral, recent records, bloodwork, imaging, EKG?" The receptionist answers with 1-4 specific prep items appropriate to the specialty (e.g. cardiology often wants a recent EKG + lipid panel; orthopedics wants recent imaging of the affected joint; GI may want fasting bloodwork; many want a referral from PCP + photo ID + insurance card + medication list). For each item, encode it in outcome.prep with the correct category and set bookable=true ONLY if it requires a separate appointment somewhere else (lab draw, imaging center, outpatient EKG). If the specialist will do it in their office, use category "in_office" and bookable=false. Receptionist either offers a specific slot (day + time), says no availability for ~2 weeks, or it's a voicemail (then only 1-2 turns, Mara leaves a message, no prep). Vary outcomes naturally — ~65% offered, ~20% no_availability, ~15% voicemail.`;

    const insLine = data.insurance
      ? `Insurance: ${data.insurance.payer ?? "Unknown payer"}${data.insurance.plan ? ` — ${data.insurance.plan}` : ""}${data.insurance.member_id ? ` (member ${data.insurance.member_id})` : ""}${data.insurance.referral_required ? " — referral required" : ""}`
      : "Insurance: not on file";
    const refLine = data.referring_doctor
      ? `Referred by: ${data.referring_doctor}`
      : "Referred by: self-referral (no PCP on file)";

    const recallLine = data.recall_reason
      ? `\n*** CALLBACK *** Previously offered: ${data.previous_slot ?? "an earlier slot"}. Patient asked to reschedule. Reason: ${data.recall_reason}. Mara must reference this and request a different ${/(day|date|weekday)/i.test(data.recall_reason) ? "day" : "time"} that still fits preferences.`
      : "";

    const user = `Patient: ${data.patient_name}
${refLine}
${insLine}
Calling: ${data.provider_name}, ${data.provider_specialty} — ${data.provider_location}
${prefLine}${recallLine}`;


    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Gateway ${res.status}: ${t}`);
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { turns: DialogTurn[]; outcome: DialogOutcome };
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("Bad JSON from model");
    }
    return {
      turns: Array.isArray(parsed.turns) ? parsed.turns : [],
      outcome: parsed.outcome ?? { kind: "no_availability" },
      office_voice_id: pickOfficeVoice(data.provider_name),
      mara_voice_id: MARA_VOICE,
    };
  });

export const synthesizeVoice = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ text: z.string().min(1).max(2000), voice_id: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${data.voice_id}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: data.text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.0 },
        }),
      },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`TTS ${res.status}: ${t}`);
    }
    const buf = await res.arrayBuffer();
    const { Buffer } = await import("node:buffer");
    const base64 = Buffer.from(buf).toString("base64");
    return { audio_base64: base64 };
  });

const PATIENT_VOICE_POOL = [
  "Xb7hH8MSUJpSbSDYk0k2", // Alice
  "pFZP5JQG7iQjIQuC4Bku", // Lily
  "FGY2WhTYpPnrIDTdsKH5", // Laura
];

export function pickPatientVoice(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PATIENT_VOICE_POOL[Math.abs(h) % PATIENT_VOICE_POOL.length];
}

const ConfirmInput = z.object({
  patient_name: z.string(),
  offers: z
    .array(
      z.object({
        provider_id: z.string(),
        provider_name: z.string(),
        specialty: z.string(),
        location: z.string(),
        slot: z.string(),
        prep: z
          .array(
            z.object({
              text: z.string(),
              category: z.enum([
                "bring",
                "pcp_send",
                "lab",
                "imaging",
                "cardiac",
                "in_office",
                "other",
              ]),
              bookable: z.boolean(),
            }),
          )
          .optional()
          .default([]),
      }),
    )
    .min(1),
});

export type ConfirmTurn = { speaker: "mara" | "patient"; text: string };
export type CallbackRequest = {
  provider_id: string;
  reason: string;
  change: "day" | "time" | "other";
};
export type ConfirmOutcome = {
  accepted_provider_ids: string[];
  declined_provider_ids: string[];
  callback_requests?: CallbackRequest[];
  notes?: string;
};

export const generatePatientConfirmDialog = createServerFn({ method: "POST" })
  .inputValidator((d) => ConfirmInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const system = `You generate a short realistic phone-call transcript where Mara (AI care navigator) calls the elderly patient to read out the appointment slots she just secured, walk through prep, and get an explicit decision on each one. Output ONLY JSON: {"turns":[{"speaker":"mara"|"patient","text":"..."}], "outcome":{"accepted_provider_ids":["..."],"declined_provider_ids":["..."],"callback_requests":[{"provider_id":"...","reason":"...","change":"day"|"time"|"other"}],"notes":"..."}}. 10-20 turns. Warm, slow, clear language for an older adult. Mara opens by greeting the patient by first name and says she got through to the offices and wants to read out each appointment to confirm. For EACH offer Mara MUST: (1) clearly VOICE the doctor name, specialty, clinic location, and the exact day and time of the appointment; (2) read the prep checklist — what to bring (ID, insurance card, medication list), what to ask the primary care doctor to send (referral, recent notes/records), and any tests required beforehand (bloodwork, X-ray, EKG), saying for each whether the specialist's office does it in-house or whether Mara will book it separately at a lab/imaging center ("I'll add the bloodwork to your booking list"); (3) explicitly ask the patient to choose ONE of THREE options for this appointment, in these words or close to them: "Does this time work for you, would you like me to call back and ask for a different day or time, or should I cancel this doctor and try the next one on your list?" The patient picks exactly one of those three for each offer: (a) ACCEPT → accepted_provider_ids; (b) CALLBACK → Mara then asks the follow-up "Is it the day or the time that doesn't work — and what would work better?" patient gives day/time preference → callback_requests entry with change="day"|"time" and a short reason like "prefers mornings" or "not Tuesday, try later in the week"; (c) CANCEL/TRY NEXT → declined_provider_ids; Mara says "okay, I'll cancel that one and call the next [specialty] on your list." With 2+ offers, include at least one callback and ideally one of each outcome so the demo is realistic. End with Mara recapping: the confirmed appointments and their prep, that she'll call back the offices that need rescheduling, that she'll find a replacement specialist for any cancelled one, that she'll book any required labs/imaging, and that a confirmation email with the full checklist is on the way.`;


    const offerLines = data.offers
      .map((o, i) => {
        const prepLine =
          (o.prep ?? []).length > 0
            ? "\n   Prep required:\n" +
              (o.prep ?? [])
                .map(
                  (p) =>
                    `     - [${p.category}${p.bookable ? ", BOOKABLE" : ""}] ${p.text}`,
                )
                .join("\n")
            : "\n   Prep required: none specified";
        return `${i + 1}. ${o.provider_name} (${o.specialty}) at ${o.location} — ${o.slot} [id:${o.provider_id}]${prepLine}`;
      })
      .join("\n");
    const user = `Patient: ${data.patient_name}\nOffers secured:\n${offerLines}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-3.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Gateway ${res.status}: ${t}`);
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { turns: ConfirmTurn[]; outcome: ConfirmOutcome };
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("Bad JSON from model");
    }
    return {
      turns: Array.isArray(parsed.turns) ? parsed.turns : [],
      outcome: parsed.outcome ?? { accepted_provider_ids: [], declined_provider_ids: [] },
      mara_voice_id: MARA_VOICE,
      patient_voice_id: pickPatientVoice(data.patient_name),
    };
  });

