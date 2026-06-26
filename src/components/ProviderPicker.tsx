/**
 * ProviderPicker — multi-select list of doctors/specialists.
 * Patient checks every office they're open to; Mara batch-calls them and
 * picks the best match against the patient's stated preferences.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MapPin, Stethoscope, PhoneOutgoing } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickedProvider = {
  id: string;
  name: string;
  specialty: string;
  location: string;
  accepts_insurance: string[];
};

type Props = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onConfirm: (providers: PickedProvider[]) => void;
};

export function ProviderPicker({ selectedIds, onChange, onConfirm }: Props) {
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

  const selectedSet = new Set(selectedIds);
  function toggle(id: string) {
    const next = selectedSet.has(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onChange(next);
  }

  function confirm() {
    const picked = (data ?? []).filter((p) => selectedSet.has(p.id));
    if (picked.length > 0) onConfirm(picked);
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Pick the offices Mara should call</h2>
          <p className="text-sm text-muted-foreground">
            Select every doctor you'd be willing to see. Mara will call all of them, compare
            availability against your preferences, and book the best match.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0">{selectedIds.length} selected</Badge>
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
            const active = selectedSet.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={cn(
                  "flex gap-3 rounded-lg border-2 p-4 text-left transition-all hover:border-primary",
                  active ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <Checkbox checked={active} className="mt-0.5 pointer-events-none" />
                <div className="min-w-0 flex-1">
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
                </div>
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <Button onClick={confirm} disabled={selectedIds.length === 0} className="gap-2">
          <PhoneOutgoing className="h-4 w-4" />
          Continue with {selectedIds.length || 0} office{selectedIds.length === 1 ? "" : "s"}
        </Button>
      </div>
    </Card>
  );
}
