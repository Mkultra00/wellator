import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { VoicePanel, type Scenario } from "@/components/VoicePanel";
import { usePatient } from "@/lib/patient-context";
import { listScheduledCalls, updateScheduledCallStatus } from "@/lib/data.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, Clock, CheckCircle2, X } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";


export const Route = createFileRoute("/inbox")({
  head: () => ({
    meta: [
      { title: "Scheduled calls — Mara" },
      {
        name: "description",
        content:
          "Mocked outbound call inbox. Demonstrates how Mara would reach patients for reminders, PT follow-ups, and billing check-ins.",
      },
    ],
  }),
  component: InboxPage,
});

type Scheduled = {
  id: string;
  patient_id: string;
  scenario: "reminder" | "pt_followup" | "billing_checkin";
  context: Record<string, unknown>;
  due_at: string;
  status: "pending" | "completed" | "skipped";
  patients?: { full_name: string } | null;
};

const SCENARIO_TO_VOICE: Record<Scheduled["scenario"], Scenario> = {
  reminder: "reminder",
  pt_followup: "pt_followup",
  billing_checkin: "billing_explainer",
};

const SCENARIO_LABEL: Record<Scheduled["scenario"], string> = {
  reminder: "Appointment reminder",
  pt_followup: "PT follow-up",
  billing_checkin: "Billing check-in",
};

function InboxPage() {
  const { patients, setPatientId, patient } = usePatient();
  const [active, setActive] = useState<Scheduled | null>(null);
  const qc = useQueryClient();
  const fetchScheduled = useServerFn(listScheduledCalls);
  const updateStatus = useServerFn(updateScheduledCallStatus);

  const { data, isLoading } = useQuery({
    queryKey: ["scheduled_calls"],
    queryFn: async () => (await fetchScheduled()) as Scheduled[],
  });

  const answer = (call: Scheduled) => {
    setPatientId(call.patient_id);
    setActive(call);
  };

  const markDone = async (id: string) => {
    await updateStatus({ data: { id, status: "completed" } });
    qc.invalidateQueries({ queryKey: ["scheduled_calls"] });
  };
  const skip = async (id: string) => {
    await updateStatus({ data: { id, status: "skipped" } });
    qc.invalidateQueries({ queryKey: ["scheduled_calls"] });
  };


  const activePatient = active ? patients.find((p) => p.id === active.patient_id) ?? patient : null;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Scheduled outbound calls</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            In production, Mara would dial these patients automatically. For the demo, press{" "}
            <strong>Answer</strong> to simulate the patient picking up — same agent, same tools, same
            transcript.
          </p>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-3">
            {(data ?? []).map((c) => {
              const isPast = new Date(c.due_at).getTime() < Date.now();
              return (
                <Card key={c.id} className="flex flex-wrap items-center gap-4 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Phone className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{c.patients?.full_name}</span>
                      <Badge variant="outline">{SCENARIO_LABEL[c.scenario]}</Badge>
                      <Badge
                        variant={
                          c.status === "completed"
                            ? "default"
                            : c.status === "skipped"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {c.status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {isPast ? "Due" : "Scheduled"}{" "}
                      {formatDistanceToNowStrict(new Date(c.due_at), { addSuffix: true })}
                    </div>
                    {Object.keys(c.context ?? {}).length > 0 && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Context: {JSON.stringify(c.context)}
                      </div>
                    )}
                  </div>
                  {c.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => answer(c)} className="gap-1">
                        <Phone className="h-4 w-4" /> Answer
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => markDone(c.id)}>
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => skip(c.id)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
            {(data ?? []).length === 0 && (
              <Card className="p-8 text-center text-muted-foreground">No scheduled calls.</Card>
            )}
          </div>
        )}

        {active && activePatient && (
          <VoicePanel
            key={active.id}
            patient={activePatient}
            scenario={SCENARIO_TO_VOICE[active.scenario]}
            context={active.context}
            onClose={() => {
              markDone(active.id);
              setActive(null);
            }}
          />
        )}
      </div>
    </AppShell>
  );
}
