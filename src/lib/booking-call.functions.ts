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
export type DialogOutcome =
  | { kind: "offered"; slot: string }
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

    const system = `You generate realistic short phone-call transcripts between Mara (an AI care navigator calling on behalf of a patient) and a receptionist at a doctor's office. Output ONLY valid JSON matching: {"turns":[{"speaker":"mara"|"office","text":"..."}], "outcome": {"kind":"offered","slot":"..."} | {"kind":"voicemail"} | {"kind":"no_availability"}}. 6-10 turns. Natural, concise spoken lines (1-2 sentences each). In her OPENING turn Mara must: identify herself as an AI care navigator, name the patient, name the referring primary care doctor (if provided), and state the patient's insurance payer + plan (if provided). Then request an appointment matching preferences. If this is a CALLBACK (the user prompt will say so), Mara opens by saying she's calling back about the previously offered slot, explains the patient asked to reschedule and gives the reason (day vs time), and asks for an alternative that fits. Receptionist either offers a specific slot (day + time), says no availability for ~2 weeks, or it's a voicemail (then only 1-2 turns, Mara leaves a message). Vary outcomes naturally — ~65% offered, ~20% no_availability, ~15% voicemail.`;

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
      }),
    )
    .min(1),
});

export type ConfirmTurn = { speaker: "mara" | "patient"; text: string };
export type ConfirmOutcome = {
  accepted_provider_ids: string[];
  declined_provider_ids: string[];
  notes?: string;
};

export const generatePatientConfirmDialog = createServerFn({ method: "POST" })
  .inputValidator((d) => ConfirmInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const system = `You generate a short realistic phone-call transcript where Mara (AI care navigator) calls the elderly patient to review the appointment slots she just secured and asks the patient to confirm. Output ONLY JSON: {"turns":[{"speaker":"mara"|"patient","text":"..."}], "outcome":{"accepted_provider_ids":["..."],"declined_provider_ids":["..."],"notes":"..."}}. 6-10 turns. Warm, slow, clear language for an older adult. Mara opens by greeting the patient by first name, says she called the offices, then lists each offer (provider, specialty, day/time). She asks the patient if the times work. Patient responds naturally — usually accepts most/all, sometimes asks to skip one. End with Mara confirming next steps and that a confirmation email is on the way.`;

    const offerLines = data.offers
      .map(
        (o, i) =>
          `${i + 1}. ${o.provider_name} (${o.specialty}) at ${o.location} — ${o.slot} [id:${o.provider_id}]`,
      )
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

