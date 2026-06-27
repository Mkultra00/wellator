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

/**
 * LLM call — prefers Baseten (DeepSeek) when BASETEN_API_KEY is set,
 * falls back to Lovable AI Gateway (gemini-2.5-flash).
 */
async function callLLM(lovableKey: string, system: string, user: string): Promise<Response> {
  const basetenKey = process.env.BASETEN_API_KEY;
  if (basetenKey) {
    const res = await fetch("https://inference.baseten.co/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${basetenKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-ai/DeepSeek-V3.2",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (res.ok) return res;
    const t = await res.text().catch(() => "");
    console.warn(`[callLLM] Baseten ${res.status}: ${t.slice(0, 200)} — falling back to Lovable gateway`);
  }
  return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": lovableKey },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
}

const DialogInput = z.object({
  patient_id: z.string().min(1).optional(),
  patient_name: z.string(),
  provider_name: z.string(),
  provider_specialty: z.string(),
  provider_location: z.string(),
  referring_doctor: z.string().nullable().optional(),
  insurance: z
    .object({
      payer: z.string().nullable().optional(),
      plan: z.string().nullable().optional(),
      referral_required: z.boolean().nullable().optional(),
    })
    .nullable()
    .optional(),
  preferences: z.object({
    preferred_locations: z.string().optional().nullable(),
    days: z.array(z.string()).optional().default([]),
    time_of_day: z.union([z.string(), z.array(z.string())]).optional().nullable(),
    max_distance_miles: z.number().optional().nullable(),
    notes: z.string().optional().nullable(),
  }),

  recall_reason: z.string().optional().nullable(),
  previous_slot: z.string().optional().nullable(),
  busy_slots: z.array(z.string()).optional().default([]),
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
  | { kind: "no_availability" };

function stableHash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function choosePreferredDay(days?: string[]) {
  const normalized = (days ?? []).filter(Boolean);
  if (normalized.length > 0) return normalized[0];
  return "Tuesday";
}

function choosePreferredTime(timeOfDay?: string | string[] | null) {
  const options = Array.isArray(timeOfDay) ? timeOfDay : timeOfDay ? [timeOfDay] : [];
  const first = options[0]?.toLowerCase() ?? "morning";
  if (first.includes("afternoon")) return "2:30 PM";
  if (first.includes("evening")) return "4:15 PM";
  if (first.includes("midday") || first.includes("noon")) return "12:45 PM";
  return "10:15 AM";
}

// Parse a slot label like "Tuesday, July 16 at 10:15 AM" into a timestamp for
// conflict checking. Mirrors the client-side parser; assumes 60-minute visit.
function parseSlotTs(slot: string): number | null {
  const m = slot.match(/([A-Za-z]+),?\s+([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\s+at\s+(\d{1,2}):(\d{2})\s*([AaPp][Mm])/);
  if (!m) return null;
  const [, , monthName, dayStr, yearStr, hStr, minStr, ampm] = m;
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const mi = months.indexOf(monthName.toLowerCase());
  if (mi < 0) return null;
  let h = parseInt(hStr, 10) % 12;
  if (ampm.toUpperCase() === "PM") h += 12;
  const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();
  return new Date(year, mi, parseInt(dayStr, 10), h, parseInt(minStr, 10)).getTime();
}

// Build a slot that doesn't sit within 120 minutes (60-min visit + 60-min
// buffer) of any already-booked slot on the same day.
function nextSlot(
  providerName: string,
  preferences: z.infer<typeof DialogInput>["preferences"],
  busySlots: string[] = [],
) {
  const days = (preferences.days ?? []).filter(Boolean);
  const dayList = days.length ? days : ["Tuesday", "Wednesday", "Thursday", "Monday", "Friday"];
  const baseTime = choosePreferredTime(preferences.time_of_day);
  const h = stableHash(providerName);
  const offset = (h % 5) + 1;
  // Wider, provider-specific time pool so two offices don't keep parroting
  // the same "10:15 / 2:30" pair.
  const POOL = [
    "8:15 AM", "8:45 AM", "9:00 AM", "9:30 AM", "10:00 AM", "10:15 AM",
    "10:45 AM", "11:15 AM", "11:30 AM", "12:00 PM", "1:00 PM", "1:30 PM",
    "1:45 PM", "2:15 PM", "2:30 PM", "3:00 PM", "3:15 PM", "3:45 PM",
    "4:00 PM", "4:30 PM", "4:45 PM",
  ];
  // Rotate the pool by a provider-specific amount so each office prefers a
  // different ordering, then put the patient's preferred time first.
  const rot = h % POOL.length;
  const rotated = [...POOL.slice(rot), ...POOL.slice(0, rot)];
  const altTimes = [baseTime, ...rotated.filter((t) => t !== baseTime)];
  const busyTs = busySlots.map(parseSlotTs).filter((t): t is number => t !== null);
  const BLOCK_MS = 120 * 60_000;
  // Stagger which day each provider tries first.
  const rotatedDays = [...dayList.slice(h % dayList.length), ...dayList.slice(0, h % dayList.length)];
  for (const day of rotatedDays) {
    for (let d = 0; d < 6; d++) {
      const dateNum = 7 + ((h + d * 3 + offset) % 21);
      for (const time of altTimes) {
        const candidate = `${day}, July ${dateNum} at ${time}`;
        const ts = parseSlotTs(candidate);
        const clash = ts != null && busyTs.some((b) => Math.abs(b - ts) < BLOCK_MS);
        if (!clash) return candidate;
      }
    }
  }
  return `${rotatedDays[0]}, July ${7 + offset} at ${baseTime}`;
}
function ensureMaraClosing<T extends { speaker: string; text: string }>(turns: T[]): T[] {
  if (turns.length === 0) return turns;
  const last = turns[turns.length - 1];
  const hasThanks = /thank/i.test(last.text);
  const hasGoodbye = /goodbye|bye|take care|have a wonderful/i.test(last.text);
  if (last.speaker === "mara" && hasThanks && hasGoodbye) return turns;
  if (last.speaker === "mara") {
    const closing = hasGoodbye
      ? " Thank you so much again."
      : hasThanks
        ? " Goodbye, and take care!"
        : " Thank you so much. Goodbye, and take care!";
    return [
      ...turns.slice(0, -1),
      { ...last, text: last.text.trim() + closing } as T,
    ];
  }
  return [
    ...turns,
    { speaker: "mara", text: "Thank you so much for your time today. Goodbye, and take care!" } as T,
  ];
}


function prepForSpecialty(specialty: string): PrepItem[] {
  const s = specialty.toLowerCase();
  const common: PrepItem[] = [
    { text: "Bring photo ID, insurance card, and a current medication list", category: "bring", bookable: false },
    { text: "Ask the referring primary care doctor to send the referral and recent office notes", category: "pcp_send", bookable: false },
  ];
  if (s.includes("card")) {
    return [
      ...common,
      { text: "Recent EKG before the visit", category: "cardiac", bookable: true },
      { text: "Recent lipid panel bloodwork", category: "lab", bookable: true },
    ];
  }
  if (s.includes("ortho")) {
    return [
      ...common,
      { text: "Recent imaging for the painful joint or area", category: "imaging", bookable: true },
    ];
  }
  if (s.includes("gastro") || s.includes("gi")) {
    return [
      ...common,
      { text: "Fasting bloodwork before the appointment", category: "lab", bookable: true },
    ];
  }
  return common;
}

function deterministicAvailabilityDialog(args: {
  data: z.infer<typeof DialogInput>;
  openingLine: string;
  referringDoctor: string | null;
  payer: string | null;
  plan: string | null;
  reason?: string;
}) {
  const slot = nextSlot(args.data.provider_name, args.data.preferences, args.data.busy_slots ?? []);
  const prep = prepForSpecialty(args.data.provider_specialty);
  const noAvailability = stableHash(`${args.data.provider_name}:${args.data.provider_specialty}`) % 5 === 0;
  const insuranceLine = args.payer ? `${args.payer}${args.plan ? ` ${args.plan}` : ""}` : "the insurance on file";

  if (noAvailability) {
    return {
      turns: [
        { speaker: "mara" as const, text: `${args.openingLine} Thank you so much for taking my call. Could you please help me schedule the first available ${args.data.provider_specialty} appointment?` },
        { speaker: "office" as const, text: `Of course, I can check that right now. I have the calendar open for ${args.data.provider_name}.` },
        { speaker: "mara" as const, text: `The referral is from ${args.referringDoctor ?? "the primary care doctor on file"}, and the patient has ${insuranceLine}.` },
        { speaker: "office" as const, text: "I checked the calendar live, and I'm sorry — we do not have availability in that requested window." },
        { speaker: "office" as const, text: "The next open appointment is about three weeks out, so I would recommend trying another specialist on the list." },
        { speaker: "mara" as const, text: "I understand, and I really appreciate your time. Thank you so much, and have a wonderful day. Goodbye!" },
      ],
      outcome: { kind: "no_availability" as const },
    };
  }

  return {
    turns: [
      { speaker: "mara" as const, text: `${args.openingLine} Thank you so much for taking my call. Could you please help me schedule the first available ${args.data.provider_specialty} appointment?` },
      { speaker: "office" as const, text: `I'd be happy to. I have ${args.data.provider_name}'s calendar open.` },
      { speaker: "mara" as const, text: `The referral is from ${args.referringDoctor ?? "the primary care doctor on file"}, and the patient has ${insuranceLine}.` },
      { speaker: "office" as const, text: `We can complete that scheduling check now. I have ${slot} available.` },
      { speaker: "mara" as const, text: "That works perfectly, thank you. Please go ahead and book that slot for us." },
      { speaker: "office" as const, text: `Done — ${args.data.patient_name} is booked with ${args.data.provider_name} on ${slot}.` },
      { speaker: "mara" as const, text: "Wonderful, thank you so much. Could you please tell me if there's anything the patient should bring or have done before the visit — referral, recent records, bloodwork, imaging, or EKG?" },
      { speaker: "office" as const, text: prep.map((p) => p.text).join(". ") + "." },
      { speaker: "mara" as const, text: "Thank you kindly for all your help today. We really appreciate it. Goodbye, and take care!" },
    ],
    outcome: { kind: "offered" as const, slot, prep },
  };
}

async function loadDemoPatientContext(patientId?: string) {
  if (!patientId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("patients")
      .select(
        "primary_provider:providers!patients_primary_provider_id_fkey(name,specialty),insurance_profiles(payer,plan,referral_required)",
      )
    .eq("id", patientId)
    .maybeSingle();
  if (error || !data) return null;
  const primary = (data as any).primary_provider;
  const insuranceProfiles = (data as any).insurance_profiles;
  return {
    referring_doctor: primary ? `${primary.name} (${primary.specialty})` : null,
    insurance: Array.isArray(insuranceProfiles)
      ? insuranceProfiles[0] ?? null
      : insuranceProfiles ?? null,
  };
}

export const generateBookingDialog = createServerFn({ method: "POST" })
  .inputValidator((d) => DialogInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const demoContext = await loadDemoPatientContext(data.patient_id);
    const referringDoctor = demoContext?.referring_doctor ?? data.referring_doctor ?? null;
    const insurance = demoContext?.insurance ?? data.insurance ?? null;

    const prefs = data.preferences;
    const todStr = Array.isArray(prefs.time_of_day)
      ? prefs.time_of_day.length
        ? prefs.time_of_day.join(" or ")
        : "any time"
      : prefs.time_of_day ?? "any time";
    const prefLine = `Preferred ${todStr} on ${
      (prefs.days ?? []).join(", ") || "any weekday"
    }${prefs.preferred_locations ? ` near ${prefs.preferred_locations}` : ""}${
      prefs.notes ? `. Notes: ${prefs.notes}` : ""
    }`;


    const system = `You generate realistic short phone-call transcripts between Mara (a warm, kind AI care navigator calling on behalf of a patient) and a scheduler at a doctor's office. Mara should always sound friendly, patient, and polite. Use "please" and "thank you" naturally, especially when asking for help, confirming a slot, or closing the call. Mara MUST end the call with a warm thank you AND a clear goodbye in her final spoken turn, for example: "Thank you so much for your help today. Have a wonderful day, and goodbye!" The person who answers IS the office scheduler — they have the live appointment calendar open in front of them and full authority to confirm, hold, and book slots themselves on this call. They MUST complete the scheduling check live. They must NEVER say things like "let me check with the scheduler", "I'll have to check with scheduling", "I'll need to call you back", "let me transfer you", "I'll have someone get back to you", "please leave a voicemail", or otherwise defer the availability check to another person, later call, voicemail, or callback. They must OFFER CONCRETE EXACT APPOINTMENT TIMES including the day and clock time with hour and minute (for example: "I have Tuesday the 14th at 10:15am or Thursday the 16th at 2:30pm — which works?"). They must NEVER give only vague windows like "morning", "afternoon", "evening", "first thing", or "later in the day". They must BOOK the chosen exact slot on the call ("Great, I've got you down for Thursday at 2:30 with Dr. X."). Mara must NOT mention travel distance, miles, or how far the office is from the patient. Outcomes on the call are exactly one of: a concrete offered+booked slot, or a live "no availability in that window" answer with a concrete next open date. Output ONLY valid JSON matching: {"turns":[{"speaker":"mara"|"office","text":"..."}], "outcome": {"kind":"offered","slot":"...","prep":[{"text":"...","category":"bring"|"pcp_send"|"lab"|"imaging"|"cardiac"|"in_office"|"other","bookable":true|false}]} | {"kind":"no_availability"}}. 6-12 turns. Natural, concise spoken lines (1-2 sentences each).

CRITICAL FACT-USE RULES — do NOT invent or alter patient facts:
- Use the patient name, referring primary care doctor, insurance payer, and plan EXACTLY as given in the user message. Copy them verbatim — never substitute other doctor names, payers (Aetna/BCBS/UHC/Medicare/etc.), or plan names.
- Do NOT mention any insurance member ID, group number, or policy number. Mara only gives the insurance payer and plan name.
- For this demo, every patient has referral and insurance information on the profile. Mara must NEVER say self-referred, no referrer, no insurance, or insurance not on file anywhere in the transcript.
- Mara's FIRST turn MUST use the prebuilt OPENING_LINE provided in the user message verbatim. You may append one short sentence requesting the appointment, but do not change the patient/PCP/insurance wording.

If this is a CALLBACK (the user prompt will say so), Mara's opening instead references the previously offered slot, explains the patient asked to reschedule with the reason (day vs time), and asks for an alternative — still using the exact patient name, PCP, and insurance from the user message.

When the office OFFERS a slot, BEFORE the call wraps Mara must ask: "Is there anything the patient should bring or have done before the visit — referral, recent records, bloodwork, imaging, EKG?" The receptionist answers with 1-4 specific prep items appropriate to the specialty (e.g. cardiology often wants a recent EKG + lipid panel; orthopedics wants recent imaging of the affected joint; GI may want fasting bloodwork; many want a referral from PCP + photo ID + insurance card + medication list). Encode each in outcome.prep; bookable=true ONLY if it needs a separate appointment elsewhere (lab draw, imaging center, outpatient EKG). If the specialist will do it in-office, use category "in_office" and bookable=false. Otherwise return no_availability with a concrete next open date. Vary outcomes ~80% offered / ~20% no_availability / 0% voicemail.

SCHEDULING CONFLICTS — the user message may list BUSY_SLOTS the patient already has on the calendar. Mara MUST mention these to the office up front ("the patient already has an appointment at <slot>, so please find something on a different day or at least an hour before or after") and the office MUST offer a slot that is either on a different day OR on the same day with at least 60 minutes of buffer between the end of one visit and the start of the next (visits run about an hour). NEVER offer or book a slot that lands within 60 minutes of any BUSY_SLOT on the same day. If the only same-day option would conflict, pick a different day.

TIME DIVERSITY — every office has its own calendar. DO NOT default to the same canned times across calls (avoid always saying "10:15 AM" or "2:30 PM"). Pick exact clock times that vary by office: use a mix across 8:15a, 8:45a, 9:00a, 9:30a, 10:00a, 10:45a, 11:15a, 11:30a, 12:00p, 1:00p, 1:30p, 1:45p, 2:15p, 3:00p, 3:15p, 3:45p, 4:00p, 4:30p, 4:45p. Vary the weekday too. Do not reuse the slot from a previous office in this batch.`;

    const payer = insurance?.payer ?? null;
    const plan = insurance?.plan ?? null;
    const referralReq = insurance?.referral_required ? " Referral is required under this plan." : "";
    const insLine = payer
      ? `Insurance: ${payer}${plan ? ` — ${plan}` : ""}${insurance?.referral_required ? " — referral required" : ""}`
      : "Insurance: on file in demo profile; verify details in chart";
    const refLine = referringDoctor
      ? `Referred by: ${referringDoctor}`
      : "Referred by: primary care provider on file in demo profile";

    const firstName = data.patient_name.split(" ")[0];
    const patientFactLine = `${
      referringDoctor
        ? `${firstName} was referred by ${referringDoctor}`
        : `${firstName} has a primary care referral on file in the demo profile`
    }, and ${firstName}'s insurance is ${payer ?? "on file in the demo profile"}${plan ? ` (${plan})` : ""}.${referralReq}`;
    const openingLine = `Hi, this is Mara, an AI care navigator calling on behalf of ${data.patient_name}. ${patientFactLine}`;
    const callbackOpeningLine = `Hi, this is Mara, an AI care navigator calling back on behalf of ${data.patient_name}. ${patientFactLine} The patient asked me to reschedule the previously offered appointment${data.previous_slot ? ` (${data.previous_slot})` : ""} because ${data.recall_reason ?? "the time did not work"}. Could we look for a different ${data.recall_reason && /(day|date|weekday)/i.test(data.recall_reason) ? "day" : "time"}?`;
    const canonicalOpeningLine = data.recall_reason ? callbackOpeningLine : openingLine;

    const recallLine = data.recall_reason
      ? `\n*** CALLBACK *** Previously offered: ${data.previous_slot ?? "an earlier slot"}. Patient asked to reschedule. Reason: ${data.recall_reason}. Mara must use the OPENING_LINE verbatim and request a different ${/(day|date|weekday)/i.test(data.recall_reason) ? "day" : "time"} that still fits preferences.`
      : "";

    const busyLine = (data.busy_slots && data.busy_slots.length)
      ? `\nBUSY_SLOTS (already booked for this patient — DO NOT offer or book any slot within 60 minutes of these on the same day; prefer a different day):\n- ${data.busy_slots.join("\n- ")}`
      : "";

    const user = `Patient: ${data.patient_name}
${refLine}
${insLine}
Calling: ${data.provider_name}, ${data.provider_specialty} — ${data.provider_location}
${prefLine}${recallLine}${busyLine}

OPENING_LINE (Mara's first turn must use this verbatim, then optionally add one short sentence requesting the appointment):
"${canonicalOpeningLine}"`;


    const res = await callLLM(apiKey, system, user);
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      // Gracefully degrade so the simulator can continue with a transcript-only
      // fallback instead of crashing the UI (e.g. workspace credit limit 403).
      console.warn(`[generateBookingDialog] Gateway ${res.status}: ${t}`);
      const fallback = deterministicAvailabilityDialog({
        data,
        openingLine: canonicalOpeningLine,
        referringDoctor,
        payer,
        plan,
      });
      return {
        ...fallback,
        office_voice_id: pickOfficeVoice(data.provider_name),
        mara_voice_id: MARA_VOICE,
        gateway_error: res.status === 403 ? "credit_limit_reached" : `gateway_${res.status}`,
      };
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { turns: DialogTurn[]; outcome: DialogOutcome };
    try {
      parsed = JSON.parse(content);
    } catch {
      const fallback = deterministicAvailabilityDialog({
        data,
        openingLine: canonicalOpeningLine,
        referringDoctor,
        payer,
        plan,
      });
      return {
        ...fallback,
        office_voice_id: pickOfficeVoice(data.provider_name),
        mara_voice_id: MARA_VOICE,
        gateway_error: "bad_model_json",
      };
    }
    const turns = Array.isArray(parsed.turns) ? parsed.turns : [];
    // Hard guarantee: Mara's first spoken turn uses the canonical opening line
    // so insurance + referring PCP are always consistent with the patient profile.
    const firstMaraIdx = turns.findIndex((t) => t?.speaker === "mara");
    if (firstMaraIdx >= 0) {
      turns[firstMaraIdx] = { speaker: "mara", text: canonicalOpeningLine };
    }
    // Sanitize: office turns must include an exact clock time, not vague
    // windows like "morning" / "afternoon" / "first thing".
    const TIME_RE = /\b\d{1,2}:\d{2}\s*(?:am|pm|a\.m\.|p\.m\.)\b/i;
    const VAGUE_RE = /\b(morning|afternoon|evening|first thing|later in the day|midday|midmorning|midafternoon)\b/i;
    const fallbackSlot =
      parsed.outcome && parsed.outcome.kind === "offered" && parsed.outcome.slot
        ? parsed.outcome.slot
        : nextSlot(data.provider_name, data.preferences, data.busy_slots ?? []);
    for (let i = 0; i < turns.length; i++) {
      const t = turns[i];
      if (t?.speaker !== "office" || typeof t.text !== "string") continue;
      if (VAGUE_RE.test(t.text) && !TIME_RE.test(t.text)) {
        turns[i] = {
          speaker: "office",
          text: t.text.replace(VAGUE_RE, fallbackSlot),
        };
      }
    }
    return {
      turns: ensureMaraClosing(turns),
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
    // Hard 8s upstream timeout so a stuck TTS call cannot stall the batch.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${data.voice_id}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            text: data.text,
            model_id: "eleven_turbo_v2_5",
            voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.0 },
          }),
          signal: ac.signal,
        },
      );
    } catch (e) {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(ac.signal.aborted ? "TTS upstream timeout (8s)" : `TTS fetch failed: ${msg}`);
    }
    clearTimeout(timer);
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error(`[synthesizeVoice] ElevenLabs ${res.status}: ${t.slice(0, 300)}`);
      throw new Error(`TTS ${res.status}: ${t.slice(0, 200)}`);
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

    const system = `You generate a short realistic phone-call transcript where Mara (a warm, kind AI care navigator) calls the elderly patient to read out the appointment slots she just secured, walk through prep, and get an explicit decision on each one. Mara should be friendly, patient, and polite. Use "please" and "thank you" naturally — for example, "Thank you for your time," "Could you please let me know if this works?" and "I really appreciate it." Greet the patient by first name, show warmth and care, and close with gratitude. Mara MUST end the call with a warm thank you AND a clear goodbye in her final spoken turn, for example: "Thank you so much for your time today. Take care, and goodbye!" Output ONLY JSON: {"turns":[{"speaker":"mara"|"patient","text":"..."}], "outcome":{"accepted_provider_ids":["..."],"declined_provider_ids":["..."],"callback_requests":[{"provider_id":"...","reason":"...","change":"day"|"time"|"other"}],"notes":"..."}}. 10-20 turns. Warm, slow, clear language for an older adult. Mara opens by greeting the patient by first name and says she got through to the offices and wants to read out each appointment to confirm. For EACH offer Mara MUST: (1) clearly VOICE the doctor name, specialty, clinic location, and the exact day and time of the appointment; (2) read the prep checklist — what to bring (ID, insurance card, medication list), what to ask the primary care doctor to send (referral, recent notes/records), and any tests required beforehand (bloodwork, X-ray, EKG), saying for each whether the specialist's office does it in-office or whether Mara will book it separately at a lab/imaging center ("I'll add the bloodwork to your booking list"); (3) explicitly ask the patient to choose ONE of THREE options for this appointment, in these words or close to them: "Does this time work for you, would you like me to call back and ask for a different day or time, or should I cancel this doctor and try the next one on your list?" The patient picks exactly one of those three for each offer: (a) ACCEPT → accepted_provider_ids; (b) CALLBACK → Mara then asks the follow-up "Is it the day or the time that doesn't work — and what would work better?" patient gives day/time preference → callback_requests entry with change="day"|"time" and a short reason like "prefers mornings" or "not Tuesday, try later in the week"; (c) CANCEL/TRY NEXT → declined_provider_ids; Mara says "okay, I'll cancel that one and call the next [specialty] on your list." With 2+ offers, include at least one callback and ideally one of each outcome so the demo is realistic. End with Mara recapping: the confirmed appointments and their prep, that she'll call back the offices that need rescheduling, that she'll find a replacement specialist for any cancelled one, that she'll book any required labs/imaging, and that a confirmation email with the full checklist is on the way. Mara must close with a warm thank you and a clear goodbye.`;


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

    const res = await callLLM(apiKey, system, user);
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn(`[generatePatientConfirmDialog] Gateway ${res.status}: ${t}`);
      // Auto-accept all offers so the booking flow still completes when the
      // AI gateway is unavailable (e.g. workspace credit limit reached).
      return {
        turns: [
          {
            speaker: "mara" as const,
            text: `Hi ${data.patient_name.split(" ")[0]}, this is Mara. I was able to secure ${data.offers.length} appointment${data.offers.length === 1 ? "" : "s"} for you. Thank you so much for your time. I'll email the details now — please reply if anything needs to change. Take care.`,
          },
        ],
        outcome: {
          accepted_provider_ids: data.offers.map((o) => o.provider_id),
          declined_provider_ids: [],
          callback_requests: [],
        },
        mara_voice_id: MARA_VOICE,
        patient_voice_id: pickPatientVoice(data.patient_name),
        gateway_error: res.status === 403 ? "credit_limit_reached" : `gateway_${res.status}`,
      };
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

