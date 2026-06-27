/**
 * BatchCallSimulator — sequentially places REAL voice calls (via ElevenLabs)
 * for each picked provider. Mara dials each office one at a time. The person
 * answering at the office speaks into the mic (or another voice agent can
 * answer if one is wired up). After each call ends the user marks the
 * outcome and Mara advances to the next office.
 */
import { useMemo, useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VoicePanel } from "./VoicePanel";
import type { PickedProvider } from "./ProviderPicker";
import type { BookingPrefs } from "./BookingPreferences";
import type { Patient } from "@/lib/patient-context";

type Outcome =
  | { kind: "booked"; slot: string }
  | { kind: "offered"; slot: string }
  | { kind: "voicemail" }
  | { kind: "no_availability" };

type CallState = {
  provider: PickedProvider;
  status: "queued" | "live" | "done";
  outcome?: Outcome;
};

function scoreOutcome(o: Outcome | undefined, prefs: BookingPrefs, provider: PickedProvider) {
  if (!o || (o.kind !== "offered" && o.kind !== "booked")) return -1;
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

export function BatchCallSimulator({
  patient,
  providers,
  preferences,
  onReset,
  onClose,
}: Props) {
  const [calls, setCalls] = useState<CallState[]>(() =>
    providers.map((p) => ({ provider: p, status: "queued" })),
  );
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [phase, setPhase] = useState<"ready" | "live" | "result" | "finished">("ready");
  const [confirmedIdx, setConfirmedIdx] = useState<number | null>(null);
  const [slotDraft, setSlotDraft] = useState("");

  const current = providers[activeIdx];
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

  function startCall() {
    setCalls((prev) =>
      prev.map((c, i) => (i === activeIdx ? { ...c, status: "live" } : c)),
    );
    setPhase("live");
  }

  function endCall() {
    setPhase("result");
    setSlotDraft("");
  }

  function recordOutcome(outcome: Outcome) {
    setCalls((prev) =>
      prev.map((c, i) =>
        i === activeIdx ? { ...c, status: "done", outcome } : c,
      ),
    );
    const nextIdx = activeIdx + 1;
    if (nextIdx >= providers.length) {
      setPhase("finished");
    } else {
      setActiveIdx(nextIdx);
      setPhase("ready");
    }
  }

  function confirmBooking(i: number) {
    setConfirmedIdx(i);
    setCalls((prev) =>
      prev.map((c, idx) => {
        if (idx !== i || !c.outcome) return c;
        if (c.outcome.kind === "offered")
          return { ...c, outcome: { kind: "booked", slot: c.outcome.slot } };
        return c;
      }),
    );
  }

  return (
    <Card className="overflow-hidden border-2">
      <div className="flex items-center justify-between border-b border-border bg-primary/5 p-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Live batch calls
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

      <div className="divide-y divide-border">
        {calls.map((c, i) => (
          <CallRow
            key={c.provider.id}
            call={c}
            isActive={i === activeIdx && !allDone}
            isBest={best === i}
            isConfirmed={confirmedIdx === i}
            canConfirm={
              allDone &&
              (c.outcome?.kind === "offered" || c.outcome?.kind === "booked") &&
              confirmedIdx === null
            }
            onConfirm={() => confirmBooking(i)}
          />
        ))}
      </div>

      {!allDone && current && (
        <div className="border-t border-border bg-background p-4">
          <div className="mb-3 flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-primary" />
            <span className="font-medium">
              Call {activeIdx + 1} of {providers.length}:
            </span>
            <span>{current.name}</span>
            <Badge variant="secondary" className="text-xs">
              {current.specialty}
            </Badge>
            <span className="text-xs text-muted-foreground">· {current.location}</span>
          </div>

          {phase === "ready" && (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={startCall} className="gap-2">
                <Phone className="h-4 w-4" /> Dial {current.name}'s office
              </Button>
              <span className="text-xs text-muted-foreground">
                You (or another voice agent) can play the receptionist on the other end.
              </span>
            </div>
          )}

          {phase === "live" && (
            <div className="space-y-3">
              <VoicePanel
                key={`batch-${current.id}`}
                patient={patient}
                scenario="new_booking"
                context={{
                  providers: [
                    {
                      name: current.name,
                      specialty: current.specialty,
                      location: current.location,
                    },
                  ],
                  preferences,
                  batch_position: `${activeIdx + 1} of ${providers.length}`,
                }}
                onClose={endCall}
              />
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={endCall}>
                  Mark call ended → record outcome
                </Button>
              </div>
            </div>
          )}

          {phase === "result" && (
            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
              <div className="text-sm font-medium">What happened on the call?</div>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  placeholder="e.g. Thu 3:15 PM"
                  value={slotDraft}
                  onChange={(e) => setSlotDraft(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                />
                <Button
                  size="sm"
                  disabled={!slotDraft.trim()}
                  onClick={() => recordOutcome({ kind: "offered", slot: slotDraft.trim() })}
                  className="gap-1"
                >
                  <CheckCircle2 className="h-4 w-4" /> Slot offered
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => recordOutcome({ kind: "no_availability" })}
                  className="gap-1"
                >
                  <XCircle className="h-4 w-4" /> No availability
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => recordOutcome({ kind: "voicemail" })}
                  className="gap-1"
                >
                  <Voicemail className="h-4 w-4" /> Voicemail
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                Mara will move to the next office after you record this outcome.
              </div>
            </div>
          )}
        </div>
      )}

      {allDone && (
        <div className="border-t border-border bg-muted/40 p-4 text-sm">
          {confirmedIdx !== null ? (
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              Booked with {calls[confirmedIdx].provider.name} —{" "}
              {(calls[confirmedIdx].outcome as { slot: string }).slot}.
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
  isActive,
  isBest,
  isConfirmed,
  canConfirm,
  onConfirm,
}: {
  call: CallState;
  isActive: boolean;
  isBest: boolean;
  isConfirmed: boolean;
  canConfirm: boolean;
  onConfirm: () => void;
}) {
  const { provider, status, outcome } = call;
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
              <span className="text-xs text-muted-foreground">
                · {provider.distance_miles} mi
              </span>
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
    </div>
  );
}

function StatusIcon({
  status,
  outcome,
  isActive,
}: {
  status: CallState["status"];
  outcome?: Outcome;
  isActive: boolean;
}) {
  if (status === "live" || isActive) {
    return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  }
  if (status === "queued") return <Phone className="h-4 w-4 text-muted-foreground" />;
  if (outcome?.kind === "voicemail") return <Voicemail className="h-4 w-4 text-amber-600" />;
  if (outcome?.kind === "no_availability")
    return <XCircle className="h-4 w-4 text-destructive" />;
  return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
}

function OutcomeBadge({
  status,
  outcome,
  isActive,
}: {
  status: CallState["status"];
  outcome?: Outcome;
  isActive: boolean;
}) {
  if (isActive)
    return (
      <Badge variant="outline" className="text-xs">
        <ArrowRight className="mr-1 h-3 w-3" /> Up now
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
  if (outcome.kind === "booked")
    return (
      <Badge className="bg-emerald-600 text-xs text-white hover:bg-emerald-600">
        Booked · {outcome.slot}
      </Badge>
    );
  return (
    <Badge variant="secondary" className="text-xs">
      Offered · {outcome.slot}
    </Badge>
  );
}
