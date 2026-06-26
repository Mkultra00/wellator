/**
 * ProviderPicker — shown before booking voice call.
 * Patient picks a doctor/specialist; selection is passed to Mara as context.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MapPin, Stethoscope, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickedProvider = {
  id: string;
  name: string;
  specialty: string;
  location: string;
  accepts_insurance: string[];
};

type Props = {
  selectedId?: string | null;
  onSelect: (p: PickedProvider) => void;
};

export function ProviderPicker({ selectedId, onSelect }: Props) {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["providers", "all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("providers")
        .select("id,name,specialty,location,accepts_insurance")
        .order("specialty", { ascending: true });
      return (data ?? []) as PickedProvider[];
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.specialty.toLowerCase().includes(term) ||
        p.location.toLowerCase().includes(term),
    );
  }, [data, q]);

  return (
    <Card className="p-5">
      <div className="mb-3">
        <h2 className="text-lg font-semibold">Pick a doctor or specialist</h2>
        <p className="text-sm text-muted-foreground">
          Choose who you'd like to see. Mara will call about availability and book it for you.
        </p>
      </div>
      <Input
        placeholder="Search by name, specialty, or location"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-4"
      />
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading providers…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground">No providers match that search.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((p) => {
            const active = p.id === selectedId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p)}
                className={cn(
                  "group rounded-lg border-2 p-4 text-left transition-all hover:border-primary hover:shadow-sm",
                  active ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <div className="font-medium">{p.name}</div>
                <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                  <Stethoscope className="h-3.5 w-3.5" /> {p.specialty}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> {p.location}
                </div>
                {p.accepts_insurance?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.accepts_insurance.slice(0, 3).map((ins) => (
                      <Badge key={ins} variant="secondary" className="text-xs">
                        {ins}
                      </Badge>
                    ))}
                  </div>
                )}
                <div
                  className={cn(
                    "mt-3 flex items-center gap-1 text-sm font-medium text-primary",
                    active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                  )}
                >
                  {active ? "Selected" : "Choose"} <ArrowRight className="h-4 w-4" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
