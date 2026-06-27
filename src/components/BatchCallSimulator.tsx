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
  Voicemail,
  ArrowLeft,
  ArrowRight,
  Trophy,
  Loader2,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  generateBookingDialog,
  synthesizeVoice,
  type DialogTurn,
  type DialogOutcome,
} from "@/lib/booking-call.functions";
import { getBookingContext } from "@/lib/data.functions";
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

export function BatchCallSimulator({ patient, providers, preferences, onReset, onClose }: Props) {
  const [calls, setCalls] = useState<CallState[]>(() =>
    providers.map((p) => ({ provider: p, status: "queued", turns: [], revealed: 0 })),
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const [phase, setPhase] = useState<"idle" | "running" | "finished">("idle");
  const [confirmedIdx, setConfirmedIdx] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cancelRef = useRef(false);

  const genDialog = useServerFn(generateBookingDialog);
  const tts = useServerFn(synthesizeVoice);

  const allDone = phase === "finished";

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
    return () => {
      cancelRef.current = true;
      audioRef.current?.pause();
    };
  }, []);

  function playAudio(base64: string): Promise<void> {
    return new Promise((resolve) => {
      const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
      audioRef.current = audio;
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  }

  async function runOne(idx: number) {
    const provider = providers[idx];
    setCalls((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, status: "live", turns: [], revealed: 0 } : c)),
    );
    let dialog;
    try {
      dialog = await genDialog({
        data: {
          patient_name: patient.full_name,
          provider_name: provider.name,
          provider_specialty: provider.specialty,
          provider_location: provider.location,
          preferences: {
            preferred_locations: preferences.preferred_locations,
            days: preferences.days,
            time_of_day: preferences.time_of_day,
            max_distance_miles: preferences.max_distance_miles,
            notes: preferences.notes,
          },
        },
      });
    } catch (e) {
      toast.error(`Call to ${provider.name} failed`, {
        description: e instanceof Error ? e.message : "Dialog generation failed",
      });
      setCalls((prev) =>
        prev.map((c, i) =>
          i === idx ? { ...c, status: "done", outcome: { kind: "no_availability" } } : c,
        ),
      );
      return;
    }
    setCalls((prev) => prev.map((c, i) => (i === idx ? { ...c, turns: dialog.turns } : c)));

    for (let t = 0; t < dialog.turns.length; t++) {
      if (cancelRef.current) return;
      const turn = dialog.turns[t];
      const voiceId = turn.speaker === "mara" ? dialog.mara_voice_id : dialog.office_voice_id;
      let audio: { audio_base64: string } | null = null;
      try {
        audio = await tts({ data: { text: turn.text, voice_id: voiceId } });
      } catch {
        // skip audio, still reveal text
      }
      setCalls((prev) => prev.map((c, i) => (i === idx ? { ...c, revealed: t + 1 } : c)));
      if (audio) await playAudio(audio.audio_base64);
      else await new Promise((r) => setTimeout(r, 600));
    }

    setCalls((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, status: "done", outcome: dialog.outcome } : c)),
    );
  }

  async function runAll() {
    setPhase("running");
    cancelRef.current = false;
    for (let i = 0; i < providers.length; i++) {
      if (cancelRef.current) return;
      setActiveIdx(i);
      await runOne(i);
    }
    setPhase("finished");
  }

  function confirmBooking(i: number) {
    setConfirmedIdx(i);
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
            Prefers {preferences.time_of_day} · {preferences.days.join(", ") || "any day"} ·
            within {preferences.max_distance_miles} mi
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onReset} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> New batch
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {phase === "idle" && (
        <div className="flex items-center gap-3 border-b border-border bg-background p-4">
          <Button onClick={runAll} className="gap-2">
            <Play className="h-4 w-4" /> Start batch calls
          </Button>
          <span className="text-xs text-muted-foreground">
            Mara and the office receptionists are both AI voices — sit back and listen.
          </span>
        </div>
      )}

      <div className="divide-y divide-border">
        {calls.map((c, i) => (
          <CallRow
            key={c.provider.id}
            call={c}
            patientName={patient.full_name}
            isActive={i === activeIdx && phase === "running"}
            isBest={best === i}
            isConfirmed={confirmedIdx === i}
            canConfirm={allDone && c.outcome?.kind === "offered" && confirmedIdx === null}
            onConfirm={() => confirmBooking(i)}
          />
        ))}
      </div>

      {allDone && (
        <div className="border-t border-border bg-muted/40 p-4 text-sm">
          {confirmedIdx !== null ? (
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              Booked with {calls[confirmedIdx].provider.name}
              {calls[confirmedIdx].outcome?.kind === "offered" &&
                ` — ${(calls[confirmedIdx].outcome as { slot: string }).slot}`}
              .
            </div>
          ) : best !== null ? (
            <div>
              <Trophy className="mr-1 inline h-4 w-4 text-amber-600" />
              Best match: <strong>{calls[best].provider.name}</strong> at{" "}
              {(calls[best].outcome as { slot: string }).slot}. Click Confirm on that row to book.
            </div>
          ) : (
            <div className="text-muted-foreground">
              No offices had availability. Mara will retry later or escalate to a human navigator.
            </div>
          )}
        </div>
      )}
    </Card>
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
          <div className="flex items-center gap-2">
            <StatusIcon status={status} outcome={outcome} isActive={isActive} />
            <div className="font-medium">{provider.name}</div>
            <Badge variant="secondary" className="text-xs">
              {provider.specialty}
            </Badge>
            {provider.distance_miles != null && (
              <span className="text-xs text-muted-foreground">· {provider.distance_miles} mi</span>
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

      {visibleTurns.length > 0 && (
        <div className="mt-3 space-y-2 rounded-md border border-border bg-background p-3">
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
  if (outcome?.kind === "voicemail") return <Voicemail className="h-4 w-4 text-amber-600" />;
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
  if (outcome.kind === "voicemail")
    return (
      <Badge variant="outline" className="border-amber-500 text-xs text-amber-700">
        Voicemail
      </Badge>
    );
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
