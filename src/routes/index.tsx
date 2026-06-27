import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { VoicePanel, type Scenario } from "@/components/VoicePanel";
import { ProviderPicker, type PickedProvider } from "@/components/ProviderPicker";
import { BookingPreferences, type BookingPrefs } from "@/components/BookingPreferences";
import { BatchCallSimulator } from "@/components/BatchCallSimulator";
import { usePatient } from "@/lib/patient-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarPlus, FileText, ArrowRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mara — AI Care Navigator" },
      {
        name: "description",
        content:
          "Voice-first AI care coordinator that books appointments and explains bills in plain language.",
      },
      { property: "og:title", content: "Mara — AI Care Navigator" },
      {
        property: "og:description",
        content: "Talk to Mara to book a visit or get help with a bill.",
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
    body: "Pick every doctor you'd be willing to see — Mara batch-calls each office, compares availability against your preferences, and books the best match.",
    Icon: CalendarPlus,
  },
  {
    id: "billing_explainer",
    title: "Talk to Mara",
    body: "Chat with Mara about billing, insurance, appointments, or procedures — and ask her how to use this app. She can walk you through booking a visit, checking scheduled calls, or anything else.",
    Icon: FileText,

  },
];

type BookingStep = "pick" | "prefs" | "calling";

function Index() {
  const { patient, isLoading } = usePatient();
  const [active, setActive] = useState<Scenario | null>(null);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [providers, setProviders] = useState<PickedProvider[]>([]);
  const [prefs, setPrefs] = useState<BookingPrefs | null>(null);
  const [step, setStep] = useState<BookingStep>("pick");
  const detailRef = useRef<HTMLDivElement | null>(null);

  function chooseScenario(id: Scenario) {
    setActive(id);
    setPickedIds([]);
    setProviders([]);
    setPrefs(null);
    setStep("pick");
  }

  function resetBooking() {
    setProviders([]);
    setPrefs(null);
    setStep("pick");
  }

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() =>
        detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  }, [active, step]);

  const bookingReady = active === "new_booking" && step === "calling" && providers.length > 0 && prefs;
  const otherReady = active && active !== "new_booking";

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

          <section className="grid items-start gap-4 md:grid-cols-3">
            {CARDS.map((c) => {
              const Icon = c.Icon;
              const isActive = active === c.id;
              const isBooking = c.id === "new_booking";
              return (
                <Card
                  key={c.id}
                  onClick={() => chooseScenario(c.id)}
                  className={cn(
                    "group cursor-pointer border-2 p-0 transition-all hover:border-primary hover:shadow-md",
                    isActive ? "border-primary shadow-md" : "border-border",
                  )}
                >
                  <div className="p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h2 className="mt-4 text-xl font-semibold text-foreground">{c.title}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">{c.body}</p>
                    <div className="mt-4 flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      Select <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>

                  {isBooking && isActive && (
                    <div
                      className="border-t border-border bg-primary/5 p-4"
                      ref={detailRef}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {step === "pick" && (
                        <ProviderPicker
                          selectedIds={pickedIds}
                          onChange={setPickedIds}
                          onConfirm={(list) => {
                            setProviders(list);
                            setStep("prefs");
                          }}
                        />
                      )}
                      {step === "prefs" && (
                        <BookingPreferences
                          count={providers.length}
                          onBack={() => setStep("pick")}
                          onSubmit={(p) => {
                            setPrefs(p);
                            setStep("calling");
                          }}
                        />
                      )}
                      {step === "calling" && (
                        <div className="space-y-3 rounded-lg border border-border bg-background p-4">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium">
                              Call queue ({providers.length})
                            </div>
                            <Button variant="ghost" size="sm" onClick={resetBooking} className="gap-1">
                              <ArrowLeft className="h-4 w-4" /> Start over
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {providers.map((p) => (
                              <Badge key={p.id} variant="secondary" className="text-xs">
                                {p.name} · {p.location}
                              </Badge>
                            ))}
                          </div>
                          {prefs && (
                            <div className="text-xs text-muted-foreground">
                              Prefers {prefs.time_of_day} · {prefs.days.join(", ")} · within{" "}
                              {prefs.max_distance_miles} mi
                              {prefs.preferred_locations && ` · near ${prefs.preferred_locations}`}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </section>

          {bookingReady && (
            <section className="space-y-3">
              <BatchCallSimulator
                key={`${patient.id}-${providers.map((p) => p.id).join(",")}`}
                patient={patient}
                providers={providers}
                preferences={prefs!}
                onReset={resetBooking}
                onClose={() => {
                  setActive(null);
                  resetBooking();
                }}
              />
            </section>
          )}

          {otherReady && (
            <section className="space-y-3">
              <VoicePanel
                key={`${patient.id}-${active}`}
                patient={patient}
                scenario={active!}
                onClose={() => {
                  setActive(null);
                  resetBooking();
                }}
              />
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
