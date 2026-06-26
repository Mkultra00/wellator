/**
 * ProviderPicker — referral-driven picker.
 * The patient's primary care doctor is shown at the top; specialists they
 * refer are clustered by specialty below. Patient multi-selects offices for
 * Mara to batch-call.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listReferralNetwork } from "@/lib/data.functions";
import { usePatient } from "@/lib/patient-context";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MapPin, Stethoscope, PhoneOutgoing, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickedProvider = {
  id: string;
  name: string;
  specialty: string;
  location: string;
  accepts_insurance: string[];
  is_primary?: boolean;
  distance_miles?: number | null;
};


type Props = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onConfirm: (providers: PickedProvider[]) => void;
};

export function ProviderPicker({ selectedIds, onChange, onConfirm }: Props) {
  const { patient } = usePatient();
  const [q, setQ] = useState("");
  const fetchNetwork = useServerFn(listReferralNetwork);

  const { data, isLoading } = useQuery({
    enabled: !!patient?.id,
    queryKey: ["referral-network", patient?.id],
    queryFn: async () =>
      (await fetchNetwork({ data: { patient_id: patient!.id } })) as {
        primary: PickedProvider | null;
        specialists: PickedProvider[];
      },
  });

  const primary = data?.primary ?? null;
  const specialists = data?.specialists ?? [];

  const filteredSpecialists = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return specialists;
    return specialists.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.specialty.toLowerCase().includes(term) ||
        p.location.toLowerCase().includes(term),
    );
  }, [specialists, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, PickedProvider[]>();
    for (const p of filteredSpecialists) {
      if (!map.has(p.specialty)) map.set(p.specialty, []);
      map.get(p.specialty)!.push(p);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredSpecialists]);

  const selectedSet = new Set(selectedIds);
  function toggle(id: string) {
    const next = selectedSet.has(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onChange(next);
  }

  function confirm() {
    const pool = [primary, ...specialists].filter(Boolean) as PickedProvider[];
    const picked = pool.filter((p) => selectedSet.has(p.id));
    if (picked.length > 0) onConfirm(picked);
  }

  function ProviderTile({ p }: { p: PickedProvider }) {
    const active = selectedSet.has(p.id);
    return (
      <button
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
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Pick the offices Mara should call</h2>
          <p className="text-sm text-muted-foreground">
            Your primary doctor's referral network. Select every office you'd be willing to see —
            Mara batch-calls them and books the best match for your preferences.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0">{selectedIds.length} selected</Badge>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading your care network…</div>
      ) : !primary ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No primary care doctor on file for this patient. Set one in Admin → Patients to enable
          the referral network.
        </div>
      ) : (
        <>
          <div className="mb-5">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <UserRound className="h-3.5 w-3.5" /> Primary care
            </div>
            <ProviderTile p={primary} />
          </div>

          <Input
            placeholder="Search specialists by name, specialty, or location"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="mb-4"
          />

          {grouped.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No specialist referrals match that search.
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map(([specialty, list]) => (
                <div key={specialty}>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Stethoscope className="h-3.5 w-3.5" /> {specialty}
                    <span className="text-muted-foreground/60">· {list.length} option{list.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {list.map((p) => (
                      <ProviderTile key={p.id} p={p} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="mt-5 flex justify-end">
        <Button onClick={confirm} disabled={selectedIds.length === 0} className="gap-2">
          <PhoneOutgoing className="h-4 w-4" />
          Continue with {selectedIds.length || 0} office{selectedIds.length === 1 ? "" : "s"}
        </Button>
      </div>
    </Card>
  );
}
