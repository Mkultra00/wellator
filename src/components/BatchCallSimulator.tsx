/**
 * BatchCallSimulator — mocks Mara dialing each picked office sequentially.
 * No real voice; deterministic-ish fake outcomes scored against preferences.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Phone,
  PhoneOff,
  CheckCircle2,
  XCircle,
  Loader2,
  Voicemail,
  ArrowLeft,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PickedProvider } from "./ProviderPicker";
import type { BookingPrefs } from "./BookingPreferences";
import type { Patient } from "@/lib/patient-context";

type Outcome =
  | { kind: "booked"; slot: string; day: string; time: string }
  | { kind: "offered"; slot: string; day: string; time: string }
  | { kind: "voicemail" }
  | { kind: "no_availability" };

type CallState = {
  provider: PickedProvider;
  status: "queued" | "dialing" | "talking" | "done";
  transcript: string[];
  outcome?: Outcome;
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const TIMES_BY_TOD: Record<string, string[]> = {
  morning: ["8:30 AM", "9:15 AM", "10:00 AM", "11:30 AM"],
  afternoon: ["12:30 PM", "1:45 PM", "2:30 PM", "3:15 PM"],
  evening: ["4:30 PM", "5:00 PM", "5:45 PM", "6:15 PM"],
  any: ["9:15 AM", "11:30 AM", "1:45 PM", "3:15 PM", "5:00 PM"],
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mockOutcome(provider: PickedProvider, prefs: BookingPrefs): Outcome {
  const r = rng(hash(provider.id + prefs.time_of_day + prefs.days.join(",")));
  const roll = r();
  // 15% voicemail, 15% no availability, 70% offered/booked
  if (roll < 0.15) return { kind: "voicemail" };
  if (roll < 0.3) return { kind: "no_availability" };
  const allowedDays = prefs.days.length ? prefs.days : DAYS;
  const day = allowedDays[Math.floor(r() * allowedDays.length)];
  const times = TIMES_BY_TOD[prefs.time_of_day] ?? TIMES_BY_TOD.any;
  const time = times[Math.floor(r() * times.length)];
  return { kind: "offered", slot: `${day} ${time}`, day, time };
}

function scriptFor(provider: PickedProvider, patient: Patient, outcome: Outcome): string[] {
  const office = `${provider.name}'s office`;
  const base = [
    `Mara: Hi, this is Mara, an AI care navigator calling on behalf of ${patient.full_name}. Do you have a moment?`,
  ];
  if (outcome.kind === "voicemail") {
    return [
      `Mara: Dialing ${office}…`,
      `${office}: You've reached voicemail. Please leave a message after the tone.`,
      `Mara: Hi, this is Mara calling for ${patient.full_name}. I'll try again later or leave it for the human navigator.`,
    ];
  }
  if (outcome.kind === "no_availability") {
    return [
      ...base,
      `${office}: Sure — what can I help with?`,
      `Mara: I'm looking to book a new visit within the next two weeks.`,
      `${office}: Unfortunately we're fully booked through then. Earliest is 4+ weeks out.`,
      `Mara: Understood — I'll note that and move on. Thank you.`,
    ];
  }
  return [
    ...base,
    `${office}: Of course — what are you looking for?`,
    `Mara: A new visit, preferably ${outcome.day} ${outcome.time}.`,
    `${office}: We can offer ${outcome.slot}. Want me to hold it?`,
    `Mara: Please hold it tentatively — I'll confirm once I've checked the rest of the batch.`,
  ];
}

function scoreOutcome(o: Outcome | undefined, prefs: BookingPrefs, provider: PickedProvider) {
  if (!o || o.kind !== "offered") return -1;
  let score = 100;
  if (prefs.days.length && !prefs.days.includes(o.day)) score -= 20;
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
    providers.map((p) => ({ provider: p, status: "queued", transcript: [] })),
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const [running, setRunning] = useState(true);
  const [confirmedIdx, setConfirmedIdx] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!running) return;
    if (activeIdx >= providers.length) {
      setRunning(false);
      return;
    }
    const provider = providers[activeIdx];
    const outcome = mockOutcome(provider, preferences);
    const lines = scriptFor(provider, patient, outcome);

    setCalls((prev) =>
      prev.map((c, i) => (i === activeIdx ? { ...c, status: "dialing", transcript: [] } : c)),
    );

    const dialT = setTimeout(() => {
      setCalls((prev) =>
        prev.map((c, i) => (i === activeIdx ? { ...c, status: "talking" } : c)),
      );
      lines.forEach((line, idx) => {
        const t = setTimeout(
          () => {
            setCalls((prev) =>
              prev.map((c, i) =>
                i === activeIdx ? { ...c, transcript: [...c.transcript, line] } : c,
              ),
            );
          },
          600 * (idx + 1),
        );
        timers.current.push(t);
      });
      const endT = setTimeout(
        () => {
          setCalls((prev) =>
            prev.map((c, i) => (i === activeIdx ? { ...c, status: "done", outcome } : c)),
          );
          setActiveIdx((i) => i + 1);
        },
        600 * (lines.length + 1) + 400,
      );
      timers.current.push(endT);
    }, 900);
    timers.current.push(dialT);

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, running]);

  const allDone = activeIdx >= providers.length && !running;
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

  function stop() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setRunning(false);
  }

  function confirm(i: number) {
    setConfirmedIdx(i);
    setCalls((prev) =>
      prev.map((c, idx) =>
        idx === i && c.outcome?.kind === "offered"
          ? { ...c, outcome: { ...c.outcome, kind: "booked" } }
          : c,
      ),
    );
  }

  return (
    <Card className="overflow-hidden border-2">
      <div className="flex items-center justify-between border-b border-border bg-primary/5 p-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Mock batch calls
          </div>
          <div className="text-lg font-semibold">
            Mara is calling {providers.length} {providers.length === 1 ? "office" : "offices"} for{" "}
            {patient.full_name}
          </div>
        </div>
        <div className="flex gap-2">
          {running ? (
            <Button variant="destructive" size="sm" onClick={stop} className="gap-1">
              <PhoneOff className="h-4 w-4" /> Stop
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onReset} className="gap-1">
                <ArrowLeft className="h-4 w-4" /> New batch
              </Button>
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="divide-y divide-border">
        {calls.map((c, i) => (
          <CallRow
            key={c.provider.id}
            call={c}
            isBest={best === i}
            isConfirmed={confirmedIdx === i}
            canConfirm={allDone && c.outcome?.kind === "offered" && confirmedIdx === null}
            onConfirm={() => confirm(i)}
          />
        ))}
      </div>

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
  isBest,
  isConfirmed,
  canConfirm,
  onConfirm,
}: {
  call: CallState;
  isBest: boolean;
  isConfirmed: boolean;
  canConfirm: boolean;
  onConfirm: () => void;
}) {
  const { provider, status, transcript, outcome } = call;
  return (
    <div
      className={cn(
        "p-4 transition-colors",
        status === "talking" && "bg-primary/5",
        isBest && status === "done" && "bg-amber-50/60 dark:bg-amber-950/20",
        isConfirmed && "bg-emerald-50/60 dark:bg-emerald-950/20",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusIcon status={status} outcome={outcome} />
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
          <OutcomeBadge status={status} outcome={outcome} />
          {canConfirm && (
            <Button size="sm" onClick={onConfirm}>
              Confirm
            </Button>
          )}
        </div>
      </div>

      {transcript.length > 0 && (
        <div className="mt-3 space-y-1 rounded-md bg-background p-3 text-xs">
          {transcript.map((line, i) => (
            <div key={i} className={cn(line.startsWith("Mara") && "text-primary")}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status, outcome }: { status: CallState["status"]; outcome?: Outcome }) {
  if (status === "queued") return <Phone className="h-4 w-4 text-muted-foreground" />;
  if (status === "dialing" || status === "talking")
    return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  if (outcome?.kind === "voicemail") return <Voicemail className="h-4 w-4 text-amber-600" />;
  if (outcome?.kind === "no_availability") return <XCircle className="h-4 w-4 text-destructive" />;
  return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
}

function OutcomeBadge({ status, outcome }: { status: CallState["status"]; outcome?: Outcome }) {
  if (status === "queued")
    return (
      <Badge variant="outline" className="text-xs">
        Queued
      </Badge>
    );
  if (status === "dialing")
    return (
      <Badge variant="outline" className="text-xs">
        Dialing…
      </Badge>
    );
  if (status === "talking")
    return (
      <Badge variant="outline" className="text-xs">
        Talking…
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
