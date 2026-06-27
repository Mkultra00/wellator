/**
 * ProviderManager — admin CRUD for the doctor list patients pick from.
 * Supports manual add/edit/delete and CSV bulk upload.
 * CSV columns: name,specialty,location,accepts_insurance (insurance pipe-separated)
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Upload, Download } from "lucide-react";
import { toast } from "sonner";

type Provider = {
  id: string;
  name: string;
  specialty: string;
  location: string;
  accepts_insurance: string[];
  npi_mock: string | null;
};

const blank = { name: "", specialty: "", location: "", accepts_insurance: "", npi_mock: "" };

export function ProviderManager() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Provider | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "providers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("providers")
        .select("id,name,specialty,location,accepts_insurance,npi_mock")
        .order("specialty");
      return (data ?? []) as Provider[];
    },
  });

  function openNew() {
    setEditing(null);
    setForm(blank);
    setOpen(true);
  }
  function openEdit(p: Provider) {
    setEditing(p);
    setForm({
      name: p.name,
      specialty: p.specialty,
      location: p.location,
      accepts_insurance: (p.accepts_insurance ?? []).join(", "),
      npi_mock: p.npi_mock ?? "",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim() || !form.specialty.trim() || !form.location.trim()) {
      toast.error("Name, specialty, and location are required");
      return;
    }
    const payload = {
      name: form.name.trim(),
      specialty: form.specialty.trim(),
      location: form.location.trim(),
      accepts_insurance: form.accepts_insurance
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      npi_mock: form.npi_mock.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("providers").update(payload).eq("id", editing.id)
      : await supabase.from("providers").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Provider updated" : "Provider added");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["admin", "providers"] });
    qc.invalidateQueries({ queryKey: ["providers", "all"] });
  }

  async function remove(p: Provider) {
    if (!confirm(`Remove ${p.name}?`)) return;
    const { error } = await supabase.from("providers").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["admin", "providers"] });
    qc.invalidateQueries({ queryKey: ["providers", "all"] });
  }

  async function onCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) return toast.error("CSV is empty");
    const payload = rows.map((r) => ({
      name: r.name,
      specialty: r.specialty,
      location: r.location,
      accepts_insurance: (r.accepts_insurance ?? "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean),
      npi_mock: r.npi_mock || null,
    }));
    const { error } = await supabase.from("providers").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(`Uploaded ${payload.length} providers`);
    e.target.value = "";
    qc.invalidateQueries({ queryKey: ["admin", "providers"] });
    qc.invalidateQueries({ queryKey: ["providers", "all"] });
  }

  function downloadTemplate() {
    const csv =
      "name,specialty,location,accepts_insurance,npi_mock\n" +
      'Dr. Jane Smith,Cardiology,123 Main St Suite 4,Aetna|BCBS|Medicare,1234567890\n';
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "providers-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} size="sm">
              <Plus className="mr-1 h-4 w-4" /> Add provider
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit provider" : "Add provider"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Dr. Jane Smith" />
              <Field label="Specialty" value={form.specialty} onChange={(v) => setForm({ ...form, specialty: v })} placeholder="Cardiology" />
              <Field label="Location" value={form.location} onChange={(v) => setForm({ ...form, location: v })} placeholder="123 Main St, Suite 4" />
              <Field
                label="Accepts insurance (comma-separated)"
                value={form.accepts_insurance}
                onChange={(v) => setForm({ ...form, accepts_insurance: v })}
                placeholder="Aetna, BCBS, Medicare"
              />
              <Field label="NPI (optional)" value={form.npi_mock} onChange={(v) => setForm({ ...form, npi_mock: v })} placeholder="1234567890" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save}>{editing ? "Save" : "Add"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button asChild size="sm" variant="outline">
          <label className="cursor-pointer">
            <Upload className="mr-1 h-4 w-4" /> Upload CSV
            <input type="file" accept=".csv" className="hidden" onChange={onCsv} />
          </label>
        </Button>
        <Button size="sm" variant="ghost" onClick={downloadTemplate}>
          <Download className="mr-1 h-4 w-4" /> CSV template
        </Button>
        <span className="text-xs text-muted-foreground">
          {data?.length ?? 0} providers — patients pick from this list before Wellator calls
        </span>
      </div>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>
      ) : (
        <div className="grid gap-2">
          {(data ?? []).map((p) => (
            <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-sm text-muted-foreground">
                  {p.specialty} · {p.location}
                </div>
                {p.accepts_insurance?.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.accepts_insurance.map((i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{i}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(p)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
          {(data ?? []).length === 0 && (
            <Card className="p-6 text-sm text-muted-foreground">
              No providers yet. Add one or upload a CSV.
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur); cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
