/**
 * BookingPreferences — patient tells Mara what matters before she dials.
 * Captures preferred locations, available days, time-of-day window, and
 * max travel distance. Passed to Mara as context for batch booking.
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { ArrowLeft, PhoneCall } from "lucide-react";

export type BookingPrefs = {
  preferred_locations: string;
  days: string[];
  time_of_day: string[];
  max_distance_miles: number;
  notes: string;
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIMES = ["morning", "afternoon", "evening"] as const;







type Props = {
  count: number;
  onBack: () => void;
  onSubmit: (prefs: BookingPrefs) => void;
};

export function BookingPreferences({ count, onBack, onSubmit }: Props) {
  const [prefs, setPrefs] = useState<BookingPrefs>({
    preferred_locations: "",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    time_of_day: [],
    max_distance_miles: 15,
    notes: "",
  });

  function toggleDay(d: string) {
    setPrefs((p) => ({
      ...p,
      days: p.days.includes(d) ? p.days.filter((x) => x !== d) : [...p.days, d],
    }));
  }

  function toggleTime(t: string) {
    setPrefs((p) => ({
      ...p,
      time_of_day: p.time_of_day.includes(t)
        ? p.time_of_day.filter((x) => x !== t)
        : [...p.time_of_day, t],
    }));
  }


  return (
    <Card className="space-y-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Your scheduling preferences</h2>
          <p className="text-sm text-muted-foreground">
            Tell Mara what works for you. She'll use this to pick the best office out of the{" "}
            {count} she's about to call.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Change offices
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="loc">Preferred location / neighborhood</Label>
        <Input
          id="loc"
          placeholder="e.g. near downtown, close to home in Brookline"
          value={prefs.preferred_locations}
          onChange={(e) => setPrefs((p) => ({ ...p, preferred_locations: e.target.value }))}
        />
      </div>

      <div className="space-y-2">
        <Label>Days you can go</Label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => {
            const on = prefs.days.includes(d);
            return (
              <Badge
                key={d}
                onClick={() => toggleDay(d)}
                variant={on ? "default" : "outline"}
                className={cn("cursor-pointer px-3 py-1.5 text-sm", on ? "" : "hover:bg-muted")}
              >
                {d}
              </Badge>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Times of day (pick one or more)</Label>
        <div className="flex flex-wrap gap-2">
          {TIMES.map((t) => {
            const on = prefs.time_of_day.includes(t);
            return (
              <Badge
                key={t}
                onClick={() => toggleTime(t)}
                variant={on ? "default" : "outline"}
                className={cn("cursor-pointer px-3 py-1.5 text-sm capitalize", on ? "" : "hover:bg-muted")}
              >
                {t}
              </Badge>
            );
          })}
        </div>
        {prefs.time_of_day.length === 0 && (
          <p className="text-xs text-muted-foreground">No selection = any time of day works.</p>
        )}
      </div>


      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Max distance from home</Label>
          <span className="text-sm text-muted-foreground">{prefs.max_distance_miles} miles</span>
        </div>
        <Slider
          min={1}
          max={50}
          step={1}
          value={[prefs.max_distance_miles]}
          onValueChange={(v) => setPrefs((p) => ({ ...p, max_distance_miles: v[0] }))}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Anything else Mara should mention?</Label>
        <Textarea
          id="notes"
          placeholder="e.g. I need a morning slot before 10am, prefer female doctor, wheelchair access"
          value={prefs.notes}
          onChange={(e) => setPrefs((p) => ({ ...p, notes: e.target.value }))}
        />
      </div>

      <div className="flex justify-end">
        <Button size="lg" onClick={() => onSubmit(prefs)} className="gap-2">
          <PhoneCall className="h-4 w-4" />
          Start the batch of calls
        </Button>
      </div>
    </Card>
  );
}
