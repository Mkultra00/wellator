/**
 * BatchCallSimulator — fully AI-driven mock batch calls.
 * Mara (Gemini 3.5 Flash + ElevenLabs voice) calls each doctor's office.
 * A second ElevenLabs voice plays the receptionist. Both sides are generated
 * by the LLM as a short transcript per call, then spoken aloud turn-by-turn
 * with live transcript reveal. No human voice needed.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Phone,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  ArrowRight,
  Trophy,
  Loader2,
  Mail,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  generateBookingDialog,
  generatePatientConfirmDialog,
  synthesizeVoice,
  MARA_VOICE_ID,
  pickOfficeVoice,
  type ConfirmTurn,
  type DialogTurn,
  type DialogOutcome,
} from "@/lib/booking-call.functions";
import { saveBookingCall, listReferralNetwork } from "@/lib/data.functions";
import type { PickedProvider } from "./ProviderPicker";
import type { BookingPrefs } from "./BookingPreferences";
import type { Patient } from "@/lib/patient-context";
import { toast } from "sonner";


type CallState = {
  provider: PickedProvider;
  status: "queued" | "live" | "done";
  turns: DialogTurn[];
  revealed: number; // how many turns shown so far
  outcome?: DialogOutcome;
  decision?: "accepted" | "rejected" | "cancelled";
  recall_reason?: string;
  origin?: "initial" | "alternative" | "callback";
  replaces_provider_id?: string;
};


function scoreOutcome(o: DialogOutcome | undefined, prefs: BookingPrefs, provider: PickedProvider) {
  if (!o || o.kind !== "offered") return -1;
  let score = 100;
  if (provider.distance_miles != null) {
    score -= Math.max(0, provider.distance_miles - 1) * 3;
    if (prefs.max_distance_miles && provider.distance_miles > prefs.max_distance_miles)
      score -= 30;
  }
  return score;
}

type Props = {
  patient: Patient;
  providers: PickedProvider[];
  preferences: BookingPrefs;
  onReset: () => void;
  onClose: () => void;
};

const DIALOG_TIMEOUT_MS = 3000;
const TTS_TIMEOUT_MS = 8000;
// Safety cap only — actual end is detected via `onended`.
const AUDIO_MAX_MS = 60000;
const TURN_GAP_MS = 250;

export function BatchCallSimulator({ patient, providers, preferences, onReset, onClose }: Props) {
  const [calls, setCalls] = useState<CallState[]>(() =>
    providers.map((p) => ({ provider: p, status: "queued", turns: [], revealed: 0 })),
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const [phase, setPhase] = useState<"idle" | "running" | "finished" | "confirming" | "confirmed">(
    "idle",
  );
  const [confirmedIdx, setConfirmedIdx] = useState<number | null>(null);
  const [confirmTurns, setConfirmTurns] = useState<ConfirmTurn[]>([]);
  const [confirmRevealed, setConfirmRevealed] = useState(0);
  const [emailSent, setEmailSent] = useState<null | {
    to: string;
    subject: string;
    body: string;
  }>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cancelRef = useRef(false);
  const cleanupTimerRef = useRef<number | null>(null);
  const ttsFailedOnceRef = useRef(false);
  const [escalations, setEscalations] = useState<
    Array<{
      specialty: string;
      declined_provider_id: string;
      declined_provider_name: string;
      reason: string;
      created_at: string;
    }>
  >([]);

  const genDialog = useServerFn(generateBookingDialog);
  const genConfirm = useServerFn(generatePatientConfirmDialog);
  const tts = useServerFn(synthesizeVoice);
  const fetchNetwork = useServerFn(listReferralNetwork);
  const persistCall = useServerFn(saveBookingCall);

  const [network, setNetwork] = useState<{ specialists: PickedProvider[] } | null>(null);
  const patientConfirmedRef = useRef(false);
  const startedRef = useRef(false);

  const bookingContext = useMemo(() => {
    const pp = patient.primary_provider;
    return {
      referring_doctor: pp ? `${pp.name} (${pp.specialty})` : null,
      insurance: patient.insurance ?? null,
    };
  }, [patient]);

  useEffect(() => {
    fetchNetwork({ data: { patient_id: patient.id } })
      .then((r: any) => setNetwork({ specialists: r.specialists ?? [] }))
      .catch(() => setNetwork({ specialists: [] }));
  }, [patient.id, fetchNetwork]);


  const allDone = phase === "finished" || phase === "confirming" || phase === "confirmed";


  const best = useMemo(() => {
    if (!allDone) return null;
    let bestI = -1;
    let bestS = -1;
    calls.forEach((c, i) => {
      const s = scoreOutcome(c.outcome, preferences, c.provider);
      if (s > bestS) {
        bestS = s;
        bestI = i;
      }
    });
    return bestI >= 0 && bestS > 0 ? bestI : null;
  }, [allDone, calls, preferences]);

  useEffect(() => {
    if (cleanupTimerRef.current != null) {
      window.clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }
    cancelRef.current = false;
    return () => {
      // React StrictMode runs effect cleanup once immediately after mount in
      // dev. Delay the real cancel by one tick so the second StrictMode setup
      // can clear it; actual unmounts still stop any in-flight mock call.
      cleanupTimerRef.current = window.setTimeout(() => {
        cancelRef.current = true;
        audioRef.current?.pause();
      }, 0);
    };
  }, []);

  function speakWithBrowser(text: string, speaker: "mara" | "office" | "patient"): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        resolve();
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = speaker === "mara" ? 0.92 : 0.98;
        utterance.pitch = speaker === "mara" ? 1.05 : 0.96;
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find((v) => /female|samantha|victoria|karen|zira/i.test(v.name));
        if (speaker === "mara" && preferred) utterance.voice = preferred;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        utterance.onend = finish;
        utterance.onerror = finish;
        window.setTimeout(finish, Math.min(2500, Math.max(1200, text.length * 18)));
        window.speechSynthesis.speak(utterance);
      } catch {
        resolve();
      }
    });
  }

  function playAudio(base64: string): Promise<void> {
    return new Promise((resolve) => {
      // Stop any prior audio or browser TTS so voices never overlap.
      try { audioRef.current?.pause(); } catch {}
      try {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
      } catch {}
      const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
      audioRef.current = audio;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      const timer = window.setTimeout(finish, AUDIO_MAX_MS);
      audio.onended = () => {
        window.clearTimeout(timer);
        finish();
      };
      audio.onerror = () => {
        window.clearTimeout(timer);
        finish();
      };
      audio.play().catch(() => {
        window.clearTimeout(timer);
        finish();
      });
    });
  }

  // Client-side TTS with hard 10s timeout. Surfaces failures (once) so the
  // user knows audio is muted instead of silently waiting.
  async function ttsWithTimeout(text: string, voiceId: string): Promise<{ audio_base64: string } | null> {
    try {
      const result = await Promise.race([
        tts({ data: { text, voice_id: voiceId } }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("TTS client timeout")), TTS_TIMEOUT_MS)),
      ]);
      return result as { audio_base64: string };
    } catch (e) {
      if (!ttsFailedOnceRef.current) {
        ttsFailedOnceRef.current = true;
        toast.warning("Voice playback unavailable — showing transcripts only", {
          description: e instanceof Error ? e.message : "TTS failed",
        });
      }
      return null;
    }
  }

  type PreparedDialog = Awaited<ReturnType<typeof genDialog>>;

  function fallbackDialog(provider: PickedProvider, reason: string): PreparedDialog {
    const firstName = patient.full_name.split(" ")[0];
    const insurance = bookingContext.insurance;
    const insuranceLine = insurance?.payer
      ? `${insurance.payer}${insurance.plan ? ` (${insurance.plan})` : ""}`
      : "insurance on file";
    const referrer = bookingContext.referring_doctor ?? "the primary care provider on file";
    const prefTime = preferences.time_of_day.length ? preferences.time_of_day.join(" or ") : "any time";
    const day = preferences.days[0] || "Tuesday";
    const slot = `${day}, July 16 at ${prefTime === "any time" ? "10:15 AM" : prefTime}`;
    return {
      turns: [
        {
          speaker: "mara",
          text: `Hi, this is Mara, an AI care navigator calling on behalf of ${patient.full_name}. ${firstName} was referred by ${referrer}, and ${firstName}'s insurance is ${insuranceLine}. I'm calling to schedule a ${provider.specialty} appointment.`,
        },
        {
          speaker: "office",
          text: `I can check availability right now. I have ${provider.name}'s calendar open.`,
        },
        {
          speaker: "mara",
          text: `Please check for ${prefTime} on ${preferences.days.join(", ") || "any weekday"}.`,
        },
        {
          speaker: "office",
          text: `I can complete that now. I have ${slot} available and can book it while we're on the phone.`,
        },
        {
          speaker: "mara",
          text: "Please book that slot. Is there anything the patient should bring or have done before the visit?",
        },
        {
          speaker: "office",
          text: `Done — ${patient.full_name} is booked with ${provider.name} on ${slot}. Please bring photo ID, insurance card, and a medication list, and have the referral sent before the visit.`,
        },
      ],
      outcome: {
        kind: "offered",
        slot,
        prep: [
          { text: "Bring photo ID, insurance card, and a current medication list", category: "bring", bookable: false },
          { text: "Have the referring primary care doctor send the referral before the visit", category: "pcp_send", bookable: false },
        ],
      },
      office_voice_id: pickOfficeVoice(provider.name),
      mara_voice_id: MARA_VOICE_ID,
      gateway_error: reason,
    } as PreparedDialog;
  }

  async function prepareDialog(
    provider: PickedProvider,
    opts?: { recall_reason?: string; previous_slot?: string | null },
  ): Promise<PreparedDialog | null> {
    const recallNote = opts?.recall_reason ? `Patient asked to reschedule — ${opts.recall_reason}` : null;
    const mergedNotes = [preferences.notes, recallNote].filter(Boolean).join(". ");
    try {
      return await Promise.race([
        genDialog({
          data: {
            patient_name: patient.full_name,
            patient_id: patient.id,
            provider_name: provider.name,
            provider_specialty: provider.specialty,
            provider_location: provider.location,
            referring_doctor: bookingContext.referring_doctor,
            insurance: bookingContext.insurance,
            preferences: {
              preferred_locations: preferences.preferred_locations,
              days: preferences.days,
              time_of_day: preferences.time_of_day,
              max_distance_miles: preferences.max_distance_miles,
              notes: mergedNotes || preferences.notes,
            },
            recall_reason: opts?.recall_reason ?? null,
            previous_slot: opts?.previous_slot ?? null,
          },
        }),
        new Promise<PreparedDialog>((resolve) =>
          window.setTimeout(
            () => resolve(fallbackDialog(provider, "dialog generation timeout")),
            DIALOG_TIMEOUT_MS,
          ),
        ),
      ]);
    } catch (e) {
      toast.warning(`Using transcript-only fallback for ${provider.name}`, {
        description: e instanceof Error ? e.message : "Dialog generation failed",
      });
      return fallbackDialog(provider, e instanceof Error ? e.message : "dialog generation failed");
    }
  }

  async function playDialog(idx: number, provider: PickedProvider, dialog: PreparedDialog) {
    setCalls((prev) =>
      prev.map((c, i) =>
        // Show the transcript immediately. Audio services can be slow or
        // blocked by browser autoplay rules, but the booking demo should never
        // look blank while waiting for speech.
        i === idx ? { ...c, status: "live", turns: dialog.turns, revealed: dialog.turns.length } : c,
      ),
    );
    for (let t = 0; t < dialog.turns.length; t++) {
      if (cancelRef.current) return;
      const turn = dialog.turns[t];
      const voiceId = turn.speaker === "mara" ? dialog.mara_voice_id : dialog.office_voice_id;
      const audio = await ttsWithTimeout(turn.text, voiceId);
      if (audio) await playAudio(audio.audio_base64);
      else await speakWithBrowser(turn.text, turn.speaker);
      if (t < dialog.turns.length - 1) await new Promise((r) => setTimeout(r, TURN_GAP_MS));
    }
    setCalls((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, status: "done", outcome: dialog.outcome } : c)),
    );
    persistCall({
      data: {
        patient_id: patient.id,
        scenario: "booking_call",
        transcript: dialog.turns.map((t) => ({
          speaker: t.speaker,
          who: t.speaker === "mara" ? "Mara" : `${provider.name} office`,
          text: t.text,
        })),
        outcome: JSON.stringify({
          kind: dialog.outcome.kind,
          slot: dialog.outcome.kind === "offered" ? (dialog.outcome as any).slot : null,
          provider_id: provider.id,
          provider_name: provider.name,
          provider_specialty: provider.specialty,
          provider_location: provider.location,
          status:
            dialog.outcome.kind === "offered"
              ? "booked"
              : "no_availability",
        }),
      },
    }).catch(() => {});
  }

  // Backwards-compat wrapper used by recallOne / follow-up tasks.
  async function runOne(
    idx: number,
    provider: PickedProvider,
    opts?: { recall_reason?: string; previous_slot?: string | null },
  ) {
    setCalls((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, status: "live", turns: [], revealed: 0 } : c)),
    );
    const dialog = await prepareDialog(provider, opts);
    if (!dialog) {
      setCalls((prev) =>
        prev.map((c, i) =>
          i === idx ? { ...c, status: "done", outcome: { kind: "no_availability" } } : c,
        ),
      );
      return;
    }
    await playDialog(idx, provider, dialog);
  }


  async function runAll() {
    setPhase("running");
    cancelRef.current = false;
    const pending = providers.map((p, i) => ({
      i,
      p,
      promise: prepareDialog(p).then((d) => ({ i, p, d })),
    }));
    while (pending.length > 0) {
      if (cancelRef.current) return;
      const { i, d } = await Promise.race(pending.map((item) => item.promise));
      const doneIdx = pending.findIndex((item) => item.i === i);
      if (doneIdx >= 0) pending.splice(doneIdx, 1);
      setActiveIdx(i);
      if (cancelRef.current) return;
      if (!d) {
        setCalls((prev) =>
          prev.map((c, idx) =>
            idx === i ? { ...c, status: "done", outcome: { kind: "no_availability" } } : c,
          ),
        );
        continue;
      }
      await playDialog(i, providers[i], d);
    }
    setPhase("finished");
  }

  // Auto-start after the patient profile context is available. Keep this tied
  // directly to the current patient object so calls cannot use stale null PCP
  // or insurance values from an earlier render.
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      runAll();
    }
  }, [bookingContext]);

  // After all office calls finish, if Mara secured any offers, call the patient
  // to read them out and confirm, then "email" the confirmation.
  useEffect(() => {
    if (phase !== "finished" || patientConfirmedRef.current) return;
    const offers = calls
      .filter((c) => c.outcome?.kind === "offered" && c.decision !== "cancelled")
      .map((c) => ({
        provider_id: c.provider.id,
        provider_name: c.provider.name,
        specialty: c.provider.specialty,
        location: c.provider.location,
        slot: (c.outcome as { slot: string; prep?: any[] }).slot,
        prep: ((c.outcome as any).prep ?? []) as Array<{
          text: string;
          category: string;
          bookable: boolean;
        }>,
      }));
    if (offers.length === 0) return;
    let cancelled = false;
    (async () => {
      setPhase("confirming");
      setConfirmTurns([]);
      setConfirmRevealed(0);
      let confirm;
      try {
        confirm = await genConfirm({
          data: { patient_name: patient.full_name, offers },
        });
      } catch (e) {
        toast.error("Patient confirmation call failed", {
          description: e instanceof Error ? e.message : "Dialog generation failed",
        });
        setPhase("finished");
        return;
      }
      if (cancelled) return;
      setConfirmTurns(confirm.turns);
      for (let t = 0; t < confirm.turns.length; t++) {
        if (cancelRef.current || cancelled) return;
        const turn = confirm.turns[t];
        const voiceId = turn.speaker === "mara" ? confirm.mara_voice_id : confirm.patient_voice_id;
        setConfirmRevealed(t + 1);
        const audio = await ttsWithTimeout(turn.text, voiceId);
        if (audio) await playAudio(audio.audio_base64);
        else await speakWithBrowser(turn.text, turn.speaker);
        if (t < confirm.turns.length - 1) await new Promise((r) => setTimeout(r, TURN_GAP_MS));
      }
      if (cancelled) return;
      patientConfirmedRef.current = true;
      const accepted = new Set(confirm.outcome.accepted_provider_ids ?? []);
      const declined = new Set(confirm.outcome.declined_provider_ids ?? []);
      const callbacks = confirm.outcome.callback_requests ?? [];

      setCalls((prev) =>
        prev.map((c) => {
          if (accepted.has(c.provider.id)) return { ...c, decision: "accepted" };
          if (declined.has(c.provider.id)) return { ...c, decision: "rejected" };
          return c;
        }),
      );

      const acceptedOffers = offers.filter((o) => accepted.has(o.provider_id));
      const offersForEmail = acceptedOffers.length > 0 ? acceptedOffers : offers;
      const subject = `Your appointment${acceptedOffers.length === 1 ? "" : "s"} & prep checklist`;
      const lines = offersForEmail
        .map((o) => {
          const prepLines = (o.prep ?? []).length
            ? "\n   Before this visit:\n" +
              (o.prep ?? [])
                .map(
                  (p) =>
                    `     • ${p.text}${p.bookable ? "  ← Mara will book this for you" : ""}`,
                )
                .join("\n")
            : "";
          return `• ${o.provider_name} (${o.specialty}) — ${o.slot}\n  ${o.location}${prepLines}`;
        })
        .join("\n\n");
      const bookable = offersForEmail.flatMap((o) =>
        (o.prep ?? [])
          .filter((p) => p.bookable)
          .map((p) => `${p.text} (for ${o.provider_name})`),
      );
      const followups: string[] = [];
      if (callbacks.length > 0)
        followups.push(`I'll call ${callbacks.length} office${callbacks.length === 1 ? "" : "s"} back to reschedule.`);
      if (declined.size > 0)
        followups.push(`I'll find ${declined.size === 1 ? "an alternative doctor" : `${declined.size} alternative doctors`} from your referral list.`);
      if (bookable.length > 0)
        followups.push(`I'll add ${bookable.length} test${bookable.length === 1 ? "" : "s"} (lab/imaging) to your booking list so I can schedule those too.`);
      const body = `Hi ${patient.full_name.split(" ")[0]},\n\nThis is Mara following up on our call. Here's what we lined up:\n\n${lines || "(none yet — see below)"}\n\n${followups.join(" ")}\n\nReply YES to confirm, or call us back any time.\n\n— Mara, your care navigator`;
      setEmailSent({
        to: `${patient.full_name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
        subject,
        body,
      });
      setPhase("confirmed");
      toast.success("Confirmation email sent to patient");

      persistCall({
        data: {
          patient_id: patient.id,
          scenario: "patient_confirmation",
          transcript: confirm.turns.map((t) => ({
            speaker: t.speaker,
            who: t.speaker === "mara" ? "Mara" : patient.full_name,
            text: t.text,
          })),
          outcome: JSON.stringify({
            kind: "patient_confirmed",
            status: "confirmed",
            accepted_provider_ids: [...accepted],
            declined_provider_ids: [...declined],
            callback_requests: callbacks,
            offers: acceptedOffers,
            email: { to: `${patient.full_name.toLowerCase().replace(/\s+/g, ".")}@example.com`, subject, body },
          }),
        },
      }).catch(() => {});

      // ---- Follow-ups: recall offices the patient asked to reschedule, and
      // find alternative doctors from the referral network for declined ones.
      const followupTasks: Array<() => Promise<void>> = [];

      for (const cb of callbacks) {
        if (declined.has(cb.provider_id)) continue;
        const existingIdx = calls.findIndex((c) => c.provider.id === cb.provider_id);
        if (existingIdx < 0) continue;
        const prevSlot =
          calls[existingIdx].outcome?.kind === "offered"
            ? (calls[existingIdx].outcome as { slot: string }).slot
            : null;
        const targetProvider = calls[existingIdx].provider;
        followupTasks.push(async () => {
          setCalls((prev) =>
            prev.map((c, i) =>
              i === existingIdx
                ? {
                    ...c,
                    status: "queued",
                    outcome: undefined,
                    turns: [],
                    revealed: 0,
                    decision: undefined,
                    recall_reason: cb.reason,
                    origin: "callback",
                  }
                : c,
            ),
          );
          setActiveIdx(existingIdx);
          await runOne(existingIdx, targetProvider, {
            recall_reason: cb.reason,
            previous_slot: prevSlot,
          });
        });
      }

      const usedIds = new Set(calls.map((c) => c.provider.id));
      for (const declinedId of declined) {
        const declinedCall = calls.find((c) => c.provider.id === declinedId);
        if (!declinedCall) continue;
        const alt = (network?.specialists ?? [])
          .filter(
            (s) =>
              s.specialty === declinedCall.provider.specialty && !usedIds.has(s.id),
          )
          .sort((a, b) => (a.distance_miles ?? 9999) - (b.distance_miles ?? 9999))[0];
        if (!alt) {
          const esc = {
            specialty: declinedCall.provider.specialty,
            declined_provider_id: declinedCall.provider.id,
            declined_provider_name: declinedCall.provider.name,
            reason: `Patient declined ${declinedCall.provider.name} and no other in-network ${declinedCall.provider.specialty} remains. Escalating to human care coordinator.`,
            created_at: new Date().toISOString(),
          };
          setEscalations((prev) =>
            prev.some((e) => e.declined_provider_id === esc.declined_provider_id) ? prev : [...prev, esc],
          );
          persistCall({
            data: {
              patient_id: patient.id,
              scenario: "human_escalation",
              transcript: [
                {
                  speaker: "system",
                  text: `Mara exhausted in-network ${esc.specialty} options for ${patient.full_name}. Human care coordinator will call the patient directly.`,
                },
              ],
              outcome: JSON.stringify({
                kind: "human_escalation",
                status: "needs_human",
                specialty: esc.specialty,
                declined_provider_id: esc.declined_provider_id,
                declined_provider_name: esc.declined_provider_name,
                reason: esc.reason,
              }),
            },
          }).catch(() => {});
          toast.warning(`Escalated to care coordinator: no other ${esc.specialty} in network`, {
            description: "A human will call the patient directly.",
          });
          continue;
        }

        usedIds.add(alt.id);
        followupTasks.push(async () => {
          let newIdx = -1;
          setCalls((prev) => {
            newIdx = prev.length;
            return [
              ...prev,
              {
                provider: alt,
                status: "queued",
                turns: [],
                revealed: 0,
                origin: "alternative",
                replaces_provider_id: declinedId,
              },
            ];
          });
          await new Promise((r) => setTimeout(r, 50));
          if (newIdx < 0) return;
          setActiveIdx(newIdx);
          await runOne(newIdx, alt);
        });
      }

      if (followupTasks.length === 0) return;
      setPhase("running");
      toast(`Mara is following up on ${followupTasks.length} item${followupTasks.length === 1 ? "" : "s"}…`);
      for (const task of followupTasks) {
        if (cancelRef.current || cancelled) return;
        await task();
      }
      setPhase("finished");
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, calls, genConfirm, tts, patient.full_name, network]);



  function confirmBooking(i: number) {
    setConfirmedIdx(i);
    setCalls((prev) => prev.map((c, idx) => (idx === i ? { ...c, decision: "accepted" } : c)));
    toast.success(`Appointment confirmed with ${calls[i].provider.name}`);
  }

  async function recallOne(i: number) {
    const target = calls[i];
    const prevSlot =
      target.outcome?.kind === "offered" ? (target.outcome as { slot: string }).slot : null;
    const reason = window.prompt(
      `Why does ${target.provider.name} need to call back? (e.g. "patient prefers mornings" or "Tuesday doesn't work — try Thursday")`,
      target.recall_reason ?? "",
    );
    if (reason === null) return;
    setCalls((prev) =>
      prev.map((c, idx) =>
        idx === i
          ? {
              ...c,
              status: "queued",
              outcome: undefined,
              turns: [],
              revealed: 0,
              decision: undefined,
              recall_reason: reason || undefined,
              origin: "callback",
            }
          : c,
      ),
    );
    if (confirmedIdx === i) setConfirmedIdx(null);
    setActiveIdx(i);
    setPhase("running");
    await runOne(i, target.provider, {
      recall_reason: reason || undefined,
      previous_slot: prevSlot,
    });
    setPhase("finished");
  }

  function cancelOne(i: number) {
    setCalls((prev) => prev.map((c, idx) => (idx === i ? { ...c, decision: "cancelled" } : c)));
    if (confirmedIdx === i) setConfirmedIdx(null);
    toast(`Cancelled ${calls[i].provider.name}. Pick another doctor from the list.`);
  }

  function stopAnd(next: () => void) {
    cancelRef.current = true;
    audioRef.current?.pause();
    next();
  }


  return (
    <Card className="overflow-hidden border-2">
      <div className="flex items-center justify-between border-b border-border bg-primary/5 p-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            AI batch calls — Gemini 3.5 Flash · two ElevenLabs voices
          </div>
          <div className="text-lg font-semibold">
            Mara is calling {providers.length}{" "}
            {providers.length === 1 ? "office" : "offices"} for {patient.full_name}
          </div>
          <div className="text-xs text-muted-foreground">
            Prefers {preferences.time_of_day.length ? preferences.time_of_day.join("/") : "any time"} · {preferences.days.join(", ") || "any day"} ·
            within {preferences.max_distance_miles} mi
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => stopAnd(onReset)} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> New batch
          </Button>
          <Button variant="outline" size="sm" onClick={() => stopAnd(onClose)}>
            Close
          </Button>
        </div>
      </div>

      <div className="divide-y divide-border">
        {calls.map((c, i) => (
          <CallRow
            key={c.provider.id}
            call={c}
            patientName={patient.full_name}
            isActive={i === activeIdx && phase === "running"}
            isBest={best === i}
            isConfirmed={confirmedIdx === i}
            canConfirm={allDone && c.outcome?.kind === "offered" && c.decision !== "accepted"}
            onConfirm={() => confirmBooking(i)}
          />
        ))}
      </div>

      {(phase === "confirming" || phase === "confirmed") && (
        <PatientConfirmPanel
          patientName={patient.full_name}
          turns={confirmTurns}
          revealed={confirmRevealed}
          isLive={phase === "confirming"}
          email={emailSent}
        />
      )}

      {allDone && (
        <FinalReport
          calls={calls}
          preferences={preferences}
          bestIdx={best}
          confirmedIdx={confirmedIdx}
          escalations={escalations}
          onAccept={confirmBooking}
          onRecall={recallOne}
          onCancel={cancelOne}
          onPickMore={() => stopAnd(onReset)}
        />
      )}

    </Card>
  );
}

function PatientConfirmPanel({
  patientName,
  turns,
  revealed,
  isLive,
  email,
}: {
  patientName: string;
  turns: ConfirmTurn[];
  revealed: number;
  isLive: boolean;
  email: { to: string; subject: string; body: string } | null;
}) {
  const visible = turns.slice(0, revealed);
  return (
    <div className="border-t-2 border-border bg-primary/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <UserRound className="h-4 w-4 text-primary" />
        <div className="text-sm font-semibold uppercase tracking-wider">
          Mara → {patientName}
        </div>
        {isLive ? (
          <Badge variant="outline" className="text-xs">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Confirming with patient
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-xs">
            <CheckCircle2 className="mr-1 h-3 w-3" /> Patient confirmed
          </Badge>
        )}
      </div>

      {visible.length > 0 && (
        <div className="space-y-2 rounded-md border border-border bg-background p-3">
          {visible.map((t, i) => (
            <div
              key={i}
              className={cn(
                "rounded px-2 py-1.5 text-sm",
                t.speaker === "mara" ? "bg-primary/10" : "bg-muted",
              )}
            >
              <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t.speaker === "mara" ? "Mara" : patientName}
              </div>
              {t.text}
            </div>
          ))}
        </div>
      )}

      {email && (
        <div className="mt-3 rounded-md border border-border bg-background p-3">
          <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Mail className="h-3.5 w-3.5" /> Confirmation email sent
          </div>
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">To:</span> {email.to}
          </div>
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Subject:</span> {email.subject}
          </div>
          <pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-xs">
{email.body}
          </pre>
        </div>
      )}
    </div>
  );
}


function FinalReport({
  calls,
  preferences,
  bestIdx,
  confirmedIdx,
  escalations,
  onAccept,
  onRecall,
  onCancel,
  onPickMore,
}: {
  calls: CallState[];
  preferences: BookingPrefs;
  bestIdx: number | null;
  confirmedIdx: number | null;
  escalations: Array<{
    specialty: string;
    declined_provider_id: string;
    declined_provider_name: string;
    reason: string;
    created_at: string;
  }>;
  onAccept: (i: number) => void;
  onRecall: (i: number) => void;
  onCancel: (i: number) => void;
  onPickMore: () => void;
}) {
  const offered = calls.filter((c) => c.outcome?.kind === "offered");
  const accepted = calls.filter((c) => c.decision === "accepted");
  const cancelled = calls.filter((c) => c.decision === "cancelled");
  const noAvail = calls.filter((c) => c.outcome?.kind === "no_availability");

  return (
    <div className="border-t-2 border-border bg-muted/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Trophy className="h-4 w-4 text-amber-600" />
        <div className="text-sm font-semibold uppercase tracking-wider">Final report</div>
      </div>

      {escalations.length > 0 && (
        <div className="mb-4 rounded-md border-2 border-amber-500/60 bg-amber-50/60 p-3 dark:bg-amber-950/20">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <UserRound className="h-4 w-4" />
            Escalated to human care coordinator ({escalations.length})
          </div>
          <ul className="space-y-1.5 text-xs text-amber-900 dark:text-amber-200">
            {escalations.map((e) => (
              <li key={e.declined_provider_id} className="flex flex-wrap items-start gap-1.5">
                <Badge variant="outline" className="border-amber-600 text-amber-800 dark:text-amber-300">
                  {e.specialty}
                </Badge>
                <span>{e.reason}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 text-[11px] italic text-amber-700 dark:text-amber-400">
            A human coordinator will call the patient directly. Logged in Scheduled calls as "human_escalation".
          </div>
        </div>
      )}



      <div className="mb-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
        <Stat label="Called" value={calls.length} />
        <Stat label="Slots offered" value={offered.length} />
        <Stat label="Accepted" value={accepted.length} tone="emerald" />
        <Stat label="No availability" value={noAvail.length} tone="destructive" />
        <Stat label="Completed live" value={offered.length + noAvail.length} tone="amber" />
      </div>

      <div className="space-y-2">
        {calls.map((c, i) => {
          const isOffered = c.outcome?.kind === "offered";
          const slot = isOffered ? (c.outcome as { slot: string }).slot : null;
          const fitsDistance =
            c.provider.distance_miles == null ||
            c.provider.distance_miles <= preferences.max_distance_miles;
          return (
            <div
              key={c.provider.id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background p-3 text-sm",
                c.decision === "accepted" && "border-emerald-500/50 bg-emerald-50/40 dark:bg-emerald-950/20",
                c.decision === "cancelled" && "opacity-60",
                bestIdx === i && c.decision !== "accepted" && "border-amber-500/60",
              )}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.provider.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {c.provider.specialty}
                  </Badge>
                  {c.provider.distance_miles != null && (
                    <span className="text-xs text-muted-foreground">
                      · {c.provider.distance_miles} mi
                      {!fitsDistance && " (over your max)"}
                    </span>
                  )}
                  {bestIdx === i && c.decision !== "accepted" && (
                    <Badge variant="outline" className="border-amber-500 text-xs text-amber-700">
                      Best match
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {c.decision === "accepted"
                    ? `✅ Booked — ${slot}`
                    : c.decision === "cancelled"
                      ? "❌ Cancelled by patient"
                      : c.decision === "rejected"
                        ? "🚫 Patient declined this doctor — finding alternative"
                        : isOffered
                          ? `Offered ${slot}`
                          : "No availability"}
                  {c.recall_reason && c.decision !== "rejected" && (
                    <span className="ml-1 italic">· recalled: {c.recall_reason}</span>
                  )}
                </div>

                {isOffered && c.decision !== "cancelled" && (() => {
                  const prep = ((c.outcome as any)?.prep ?? []) as Array<{
                    text: string;
                    category: string;
                    bookable: boolean;
                  }>;
                  if (prep.length === 0) return null;
                  return (
                    <div className="mt-2 rounded border border-border bg-muted/40 p-2">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Before this visit
                      </div>
                      <ul className="space-y-0.5 text-xs">
                        {prep.map((p, pi) => (
                          <li key={pi} className="flex items-start gap-1.5">
                            <span className="mt-0.5 inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            <span>
                              {p.text}{" "}
                              <Badge
                                variant="outline"
                                className={cn(
                                  "ml-1 text-[9px] uppercase",
                                  p.bookable && "border-amber-500 text-amber-700",
                                )}
                              >
                                {p.category.replace("_", " ")}
                                {p.bookable && " · Mara will book"}
                              </Badge>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}

              </div>


              <div className="flex flex-wrap gap-2">
                {isOffered && c.decision !== "accepted" && c.decision !== "cancelled" && (
                  <Button size="sm" onClick={() => onAccept(i)}>
                    Time's good — accept
                  </Button>
                )}
                {c.decision !== "cancelled" && (
                  <Button size="sm" variant="outline" onClick={() => onRecall(i)}>
                    Call again
                  </Button>
                )}
                {c.decision !== "cancelled" && c.decision !== "accepted" && (
                  <Button size="sm" variant="ghost" onClick={() => onCancel(i)}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <div className="text-xs text-muted-foreground">
          {accepted.length > 0
            ? `${accepted.length} appointment${accepted.length === 1 ? "" : "s"} booked.`
            : confirmedIdx === null
              ? "No times accepted yet — accept one, recall an office, or pick another doctor."
              : ""}
        </div>
        <Button size="sm" variant="outline" onClick={onPickMore} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Pick another doctor from the list
        </Button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "destructive" | "amber";
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-background p-2 text-center",
        tone === "emerald" && "border-emerald-500/40",
        tone === "destructive" && "border-destructive/40",
        tone === "amber" && "border-amber-500/40",
      )}
    >
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function CallRow({
  call,
  patientName,
  isActive,
  isBest,
  isConfirmed,
  canConfirm,
  onConfirm,
}: {
  call: CallState;
  patientName: string;
  isActive: boolean;
  isBest: boolean;
  isConfirmed: boolean;
  canConfirm: boolean;
  onConfirm: () => void;
}) {
  const { provider, status, outcome, turns, revealed } = call;
  const visibleTurns = turns.slice(0, revealed);
  const isWaitingForTranscript = isActive && visibleTurns.length === 0;
  return (
    <div
      className={cn(
        "p-4 transition-colors",
        isActive && "bg-primary/5",
        isBest && status === "done" && "bg-amber-50/60 dark:bg-amber-950/20",
        isConfirmed && "bg-emerald-50/60 dark:bg-emerald-950/20",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusIcon status={status} outcome={outcome} isActive={isActive} />
            <div className="font-medium">{provider.name}</div>
            <Badge variant="secondary" className="text-xs">
              {provider.specialty}
            </Badge>
            {provider.distance_miles != null && (
              <span className="text-xs text-muted-foreground">· {provider.distance_miles} mi</span>
            )}
            {call.origin === "callback" && (
              <Badge variant="outline" className="border-amber-500 text-xs text-amber-700">
                Callback{call.recall_reason ? `: ${call.recall_reason}` : ""}
              </Badge>
            )}
            {call.origin === "alternative" && (
              <Badge variant="outline" className="border-primary text-xs text-primary">
                Alternative
              </Badge>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{provider.location}</div>
        </div>

        <div className="flex items-center gap-2">
          <OutcomeBadge status={status} outcome={outcome} isActive={isActive} />
          {canConfirm && (
            <Button size="sm" onClick={onConfirm}>
              Confirm
            </Button>
          )}
        </div>
      </div>

      {(visibleTurns.length > 0 || isWaitingForTranscript) && (
        <div className="mt-3 space-y-2 rounded-md border border-border bg-background p-3">
          {isWaitingForTranscript && (
            <div className="rounded bg-primary/10 px-2 py-1.5 text-sm">
              <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Mara (for {patientName})
              </div>
              Calling {provider.name}'s office now… if the AI voice service is slow, Mara will switch to a transcript-only fallback in a few seconds.
            </div>
          )}
          {visibleTurns.map((t, idx) => (
            <div
              key={idx}
              className={cn(
                "rounded px-2 py-1.5 text-sm",
                t.speaker === "mara"
                  ? "bg-primary/10"
                  : "bg-muted",
              )}
            >
              <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t.speaker === "mara" ? `Mara (for ${patientName})` : `${provider.name}'s office`}
              </div>
              {t.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusIcon({
  status,
  outcome,
  isActive,
}: {
  status: CallState["status"];
  outcome?: DialogOutcome;
  isActive: boolean;
}) {
  if (status === "live" || isActive) return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  if (status === "queued") return <Phone className="h-4 w-4 text-muted-foreground" />;
  if (outcome?.kind === "no_availability") return <XCircle className="h-4 w-4 text-destructive" />;
  return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
}

function OutcomeBadge({
  status,
  outcome,
  isActive,
}: {
  status: CallState["status"];
  outcome?: DialogOutcome;
  isActive: boolean;
}) {
  if (isActive)
    return (
      <Badge variant="outline" className="text-xs">
        <ArrowRight className="mr-1 h-3 w-3" /> On the line
      </Badge>
    );
  if (status === "queued")
    return (
      <Badge variant="outline" className="text-xs">
        Queued
      </Badge>
    );
  if (!outcome) return null;
  if (outcome.kind === "no_availability")
    return (
      <Badge variant="outline" className="border-destructive text-xs text-destructive">
        No availability
      </Badge>
    );
  return (
    <Badge variant="secondary" className="text-xs">
      Offered · {outcome.slot}
    </Badge>
  );
}
