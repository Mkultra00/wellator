import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { VoicePanel, type Scenario } from "@/components/VoicePanel";
import { usePatient } from "@/lib/patient-context";
import { Card } from "@/components/ui/card";
import { CalendarPlus, Activity, FileText, ArrowRight } from "lucide-react";
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

type Card = {
  id: Scenario;
  title: string;
  body: string;
  Icon: typeof CalendarPlus;
};

const CARDS: Card[] = [
  {
    id: "new_booking",
    title: "Book an appointment",
    body: "Tell Mara what kind of doctor you need to see, when, and with which insurance. She'll find a slot and book it.",
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
                  onClick={() => setActive(c.id)}
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

          {active && (
            <section>
              <VoicePanel
                key={`${patient.id}-${active}`}
                patient={patient}
                scenario={active}
                onClose={() => setActive(null)}
              />
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
