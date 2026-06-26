import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { VoicePanel, type Scenario } from "@/components/VoicePanel";
import { ProviderPicker, type PickedProvider } from "@/components/ProviderPicker";
import { usePatient } from "@/lib/patient-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarPlus, Activity, FileText, ArrowRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mara — AI Care Navigator" },
      {
        name: "description",
        content:
          "Voice-first AI care coordinator that books appointments, follows up after visits, and explains bills in plain language.",
      },
      { property: "og:title", content: "Mara — AI Care Navigator" },
      {
        property: "og:description",
        content: "Talk to Mara to book a visit, follow up after a treatment, or get help with a bill.",
      },
    ],
  }),
  component: Index,
});

type CardDef = {
  id: Scenario;
  title: string;
  body: string;
  Icon: typeof CalendarPlus;
};

const CARDS: CardDef[] = [
  {
    id: "new_booking",
    title: "Book an appointment",
    body: "Browse our list of doctors and specialists, pick one, and Mara will call to book a visit on your behalf.",
    Icon: CalendarPlus,
  },
  {
    id: "pt_followup",
    title: "After-visit follow-up",
    body: "Walk through a quick check-in after a physical therapy or outpatient visit. Pain, mobility, exercises, anything on your mind.",
    Icon: Activity,
  },
  {
    id: "billing_explainer",
    title: "Help me understand a bill",
    body: "Mara reads your bill or insurance statement in plain language and explains what each charge is for.",
    Icon: FileText,
  },
];

function Index() {
  const { patient, isLoading } = usePatient();
  const [active, setActive] = useState<Scenario | null>(null);
  const [provider, setProvider] = useState<PickedProvider | null>(null);

  function chooseScenario(id: Scenario) {
    setActive(id);
    setProvider(null);
  }

  const readyForVoice = active && (active !== "new_booking" || provider);

  return (
    <AppShell>
      {isLoading ? (
        <div className="text-muted-foreground">Loading patients…</div>
      ) : !patient ? (
        <div className="text-muted-foreground">Pick a demo patient from the top-right to begin.</div>
      ) : (
        <div className="space-y-8">
          <section>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Hi {patient.full_name.split(" ")[0]}, how can I help today?
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted-foreground">
              Tap one of the options below and I'll start a voice call with Mara. She'll listen, ask
              questions, and take care of the paperwork side for you.
              {patient.persona_note && (
                <span className="mt-2 block text-xs italic text-muted-foreground/80">
                  Demo context: {patient.persona_note}
                </span>
              )}
            </p>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            {CARDS.map((c) => {
              const Icon = c.Icon;
              const isActive = active === c.id;
              return (
                <Card
                  key={c.id}
                  onClick={() => chooseScenario(c.id)}
                  className={cn(
                    "group cursor-pointer border-2 p-6 transition-all hover:border-primary hover:shadow-md",
                    isActive ? "border-primary bg-primary/5 shadow-md" : "border-border",
                  )}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h2 className="mt-4 text-xl font-semibold text-foreground">{c.title}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{c.body}</p>
                  <div className="mt-4 flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Select <ArrowRight className="h-4 w-4" />
                  </div>
                </Card>
              );
            })}
          </section>

          {active === "new_booking" && !provider && (
            <section>
              <ProviderPicker selectedId={provider?.id} onSelect={setProvider} />
            </section>
          )}

          {active && (active !== "new_booking" || provider) && (
            <section className="space-y-3">
              {active === "new_booking" && provider && (
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Calling about: </span>
                    <span className="font-medium">{provider.name}</span>
                    <span className="text-muted-foreground"> · {provider.specialty} · {provider.location}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setProvider(null)} className="gap-1">
                    <ArrowLeft className="h-4 w-4" /> Change
                  </Button>
                </div>
              )}
              <VoicePanel
                key={`${patient.id}-${active}-${provider?.id ?? "none"}`}
                patient={patient}
                scenario={active}
                context={provider ? { selected_provider: provider } : undefined}
                onClose={() => {
                  setActive(null);
                  setProvider(null);
                }}
              />
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
