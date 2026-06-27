import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { listCallLogs } from "@/lib/data.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Phone,
  CheckCircle2,
  Voicemail,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Mail,
  UserRound,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";

export const Route = createFileRoute("/inbox")({
  head: () => ({
    meta: [
      { title: "Call inbox — Mara" },
      {
        name: "description",
        content:
          "Every call Mara made or received — who she spoke with, the full transcript, and whether the appointment was booked, needs follow-up, or had no availability.",
      },
    ],
  }),
  component: InboxPage,
});

type Turn = { speaker: "mara" | "office" | "patient"; who?: string; text: string };

type OutcomeInfo = {
  kind?: string;
  status?: string;
  slot?: string | null;
  provider_id?: string;
  provider_name?: string;
  provider_specialty?: string;
  provider_location?: string;
  accepted_provider_ids?: string[];
  declined_provider_ids?: string[];
  offers?: Array<{
    provider_name: string;
    specialty: string;
    slot: string;
    location: string;
  }>;
  email?: { to: string; subject: string; body: string };
};

type CallLog = {
  id: string;
  patient_id: string | null;
  scenario: string;
  started_at: string;
  ended_at: string | null;
  transcript: unknown;
  outcome: string | null;
  patients?: { full_name: string } | null;
};

const STATUS_META: Record<
  string,
  { label: string; tone: string; icon: typeof CheckCircle2 }
> = {
  booked: { label: "Booked", tone: "border-emerald-500 text-emerald-700", icon: CheckCircle2 },
  confirmed: { label: "Confirmed by patient", tone: "border-emerald-500 text-emerald-700", icon: CheckCircle2 },
  needs_more_info: {
    label: "Needs additional information",
    tone: "border-amber-500 text-amber-700",
    icon: AlertCircle,
  },
  no_availability: {
    label: "No availability",
    tone: "border-destructive text-destructive",
    icon: XCircle,
  },
};

function parseOutcome(raw: string | null): OutcomeInfo {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as OutcomeInfo;
  } catch {
    return { status: raw };
  }
}

function callerLabel(log: CallLog, outcome: OutcomeInfo): string {
  const patient = log.patients?.full_name ?? "Patient";
  if (log.scenario === "patient_confirmation") {
    return `Mara → ${patient}`;
  }
  if (outcome.provider_name) {
    return `Mara → ${outcome.provider_name}'s office (for ${patient})`;
  }
  return `Mara (for ${patient})`;
}

function InboxPage() {
  const fetchLogs = useServerFn(listCallLogs);
  const { data, isLoading } = useQuery({
    queryKey: ["call_logs"],
    queryFn: async () => (await fetchLogs()) as CallLog[],
  });
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Call inbox</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every call Mara made — to doctor offices on a patient's behalf, and her follow-up
            confirmation calls to the patient. Expand a row to read the full transcript.
          </p>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : (data ?? []).length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            No calls yet. Book an appointment on the home page — every office call and patient
            confirmation will land here with its transcript.
          </Card>
        ) : (
          <div className="space-y-3">
            {(data ?? []).map((log) => {
              const outcome = parseOutcome(log.outcome);
              const status = outcome.status ?? "completed";
              const meta = STATUS_META[status] ?? {
                label: status,
                tone: "border-border text-muted-foreground",
                icon: Phone,
              };
              const Icon = meta.icon;
              const turns = Array.isArray(log.transcript) ? (log.transcript as Turn[]) : [];
              const isOpen = !!open[log.id];
              const isPatientCall = log.scenario === "patient_confirmation";

              return (
                <Card key={log.id} className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpen((p) => ({ ...p, [log.id]: !p[log.id] }))}
                    className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent/40"
                  >
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                        isPatientCall ? "bg-primary/10 text-primary" : "bg-muted",
                      )}
                    >
                      {isPatientCall ? (
                        <UserRound className="h-5 w-5" />
                      ) : outcome.kind === "voicemail" ? (
                        <Voicemail className="h-5 w-5 text-amber-600" />
                      ) : (
                        <Phone className="h-5 w-5" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{callerLabel(log, outcome)}</span>
                        <Badge variant="outline" className={cn("gap-1 text-xs", meta.tone)}>
                          <Icon className="h-3 w-3" /> {meta.label}
                        </Badge>
                        {outcome.slot && (
                          <Badge variant="secondary" className="text-xs">
                            {outcome.slot}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {outcome.provider_specialty && (
                          <span>
                            {outcome.provider_specialty}
                            {outcome.provider_location ? ` · ${outcome.provider_location}` : ""}
                            {" · "}
                          </span>
                        )}
                        {formatDistanceToNowStrict(new Date(log.started_at), { addSuffix: true })}
                        {turns.length > 0 && ` · ${turns.length} turns`}
                      </div>
                    </div>
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t border-border bg-muted/30 p-4 space-y-3">
                      {turns.length === 0 ? (
                        <div className="text-sm text-muted-foreground">
                          No transcript captured.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {turns.map((t, i) => (
                            <div
                              key={i}
                              className={cn(
                                "rounded px-2 py-1.5 text-sm",
                                t.speaker === "mara" ? "bg-primary/10" : "bg-background",
                              )}
                            >
                              <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                {t.who ?? t.speaker}
                              </div>
                              {t.text}
                            </div>
                          ))}
                        </div>
                      )}

                      {status === "needs_more_info" && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50/40 p-3 text-sm dark:bg-amber-950/20">
                          <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
                          <div>
                            <div className="font-medium">Needs additional information</div>
                            <div className="text-xs text-muted-foreground">
                              {outcome.kind === "voicemail"
                                ? "Mara left a voicemail. Wait for a callback or re-run the call."
                                : "The office couldn't commit to a slot. Try calling again or pick another doctor."}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            asChild
                            className="ml-auto"
                          >
                            <a href="/">Call again</a>
                          </Button>
                        </div>
                      )}

                      {outcome.email && (
                        <div className="rounded-md border border-border bg-background p-3">
                          <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                            <Mail className="h-3.5 w-3.5" /> Confirmation email sent
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">To:</span>{" "}
                            {outcome.email.to}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">Subject:</span>{" "}
                            {outcome.email.subject}
                          </div>
                          <pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-xs">
{outcome.email.body}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
