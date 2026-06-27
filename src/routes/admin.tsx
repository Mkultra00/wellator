import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { adminDashboardData } from "@/lib/data.functions";
import { usePatient } from "@/lib/patient-context";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Calendar, MessageSquare, Activity, AlertOctagon } from "lucide-react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ProviderManager } from "@/components/ProviderManager";


export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Clinician dashboard — Mara" },
      { name: "description", content: "Bookings, transcripts, and PT feedback captured by Mara." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { patient } = usePatient();
  const fetchDashboard = useServerFn(adminDashboardData);
  const sessionKey = useMemo(() => crypto.randomUUID(), []);
  const dash = useQuery({
    queryKey: ["admin", "dashboard", patient?.id ?? "none", sessionKey],
    queryFn: async () =>
      await fetchDashboard({ data: patient?.id ? { patient_id: patient.id } : {} }),
    enabled: !!patient,
  });

  const apptsData = (dash.data?.appointments ?? []) as Array<{
    id: string;
    starts_at: string;
    status: string;
    reason: string | null;
    patients?: { full_name: string } | null;
    providers?: { name: string; specialty: string; location: string } | null;
  }>;
  const callsData = (dash.data?.call_logs ?? []) as unknown as Array<{
    id: string;
    scenario: string;
    started_at: string;
    ended_at: string | null;
    transcript: Array<{ role: string; text: string }>;
    human_transfer_requested: boolean;
    transfer_reason: string | null;
    patients?: { full_name: string } | null;
  }>;
  const ptData = (dash.data?.pt_feedback ?? []) as Array<{
    id: string;
    pain_0_10: number | null;
    mobility_change: string | null;
    adherence: string | null;
    comment: string | null;
    recorded_at: string;
    patients?: { full_name: string } | null;
  }>;

  const appts = { data: apptsData, isLoading: dash.isLoading };
  const calls = { data: callsData, isLoading: dash.isLoading };
  const pt = { data: ptData, isLoading: dash.isLoading };

  const transfers = callsData.filter((c) => c.human_transfer_requested);

  const todayCount = apptsData.filter(
    (a) => new Date(a.starts_at).toDateString() === new Date().toDateString(),
  ).length;
  const endedCalls = callsData.filter((c) => c.ended_at);
  const avgDurationSec =
    endedCalls.reduce(
      (sum, c) => sum + (new Date(c.ended_at!).getTime() - new Date(c.started_at).getTime()) / 1000,
      0,
    ) / Math.max(1, endedCalls.length);
  const escalatedPct = callsData.length
    ? Math.round((transfers.length / callsData.length) * 100)
    : 0;


  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Clinician dashboard</h1>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="Bookings today" value={todayCount} icon={Calendar} />
          <MetricCard label="Calls logged" value={calls.data?.length ?? 0} icon={MessageSquare} />
          <MetricCard
            label="Avg call duration"
            value={Number.isFinite(avgDurationSec) ? `${Math.round(avgDurationSec)}s` : "—"}
            icon={Activity}
          />
          <MetricCard
            label="% escalated to human"
            value={`${escalatedPct}%`}
            icon={AlertOctagon}
          />
        </div>

        <Tabs defaultValue="appointments">
          <TabsList>
            <TabsTrigger value="providers">Providers</TabsTrigger>
            <TabsTrigger value="appointments">Appointments</TabsTrigger>
            <TabsTrigger value="calls">Call transcripts</TabsTrigger>
            <TabsTrigger value="pt">PT feedback</TabsTrigger>
            <TabsTrigger value="transfers">
              Human transfers
              {transfers.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {transfers.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="providers">
            <ProviderManager />
          </TabsContent>

          <TabsContent value="appointments" className="space-y-2">
            {(appts.data ?? []).map((a) => (
              <Card key={a.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{a.patients?.full_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {a.providers?.name} · {a.providers?.specialty}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div>{format(new Date(a.starts_at), "PPp")}</div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{a.status}</Badge>
                      <Badge variant="secondary">voice agent</Badge>
                    </div>
                  </div>
                </div>
                {a.reason && (
                  <div className="mt-2 text-sm text-muted-foreground">Reason: {a.reason}</div>
                )}
              </Card>
            ))}
            {(appts.data ?? []).length === 0 && (
              <Card className="p-6 text-sm text-muted-foreground">No appointments yet.</Card>
            )}
          </TabsContent>

          <TabsContent value="calls" className="space-y-2">
            {(calls.data ?? []).map((c) => (
              <Card key={c.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{c.patients?.full_name ?? "Unknown"}</span>
                    <Badge variant="outline" className="ml-2">
                      {c.scenario}
                    </Badge>
                    {c.human_transfer_requested && (
                      <Badge variant="destructive" className="ml-2">
                        Transfer requested
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNowStrict(new Date(c.started_at), { addSuffix: true })}
                  </div>
                </div>
                <div className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded bg-muted/40 p-3 text-sm">
                  {(c.transcript as Array<{ role: string; text: string }> | null)?.map((t, i) => (
                    <div key={i}>
                      <span className="font-semibold">{t.role === "agent" ? "Mara" : "Patient"}:</span>{" "}
                      {t.text}
                    </div>
                  )) ?? <span className="text-muted-foreground">No transcript captured.</span>}
                </div>
              </Card>
            ))}
            {(calls.data ?? []).length === 0 && (
              <Card className="p-6 text-sm text-muted-foreground">No calls yet.</Card>
            )}
          </TabsContent>

          <TabsContent value="pt" className="space-y-2">
            {(pt.data ?? []).map((f) => (
              <Card key={f.id} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{f.patients?.full_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(f.recorded_at), "PPp")}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Pain</div>
                    <div className="text-lg font-semibold">{f.pain_0_10 ?? "—"}/10</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Mobility</div>
                    <div>{f.mobility_change ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Adherence</div>
                    <div>{f.adherence ?? "—"}</div>
                  </div>
                </div>
                {f.comment && (
                  <div className="mt-2 text-sm italic text-muted-foreground">"{f.comment}"</div>
                )}
              </Card>
            ))}
            {(pt.data ?? []).length === 0 && (
              <Card className="p-6 text-sm text-muted-foreground">No PT feedback yet.</Card>
            )}
          </TabsContent>

          <TabsContent value="transfers" className="space-y-2">
            {transfers.map((c) => (
              <Card key={c.id} className="border-destructive/40 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.patients?.full_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNowStrict(new Date(c.started_at), { addSuffix: true })}
                  </span>
                </div>
                <div className="mt-1 text-sm">Reason: {c.transfer_reason ?? "(not specified)"}</div>
              </Card>
            ))}
            {transfers.length === 0 && (
              <Card className="p-6 text-sm text-muted-foreground">No transfer requests.</Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Calendar;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </Card>
  );
}
