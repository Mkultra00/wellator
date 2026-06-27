import { Link, useLocation } from "@tanstack/react-router";
import { usePatient } from "@/lib/patient-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Stethoscope, Inbox, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import avatarAsset from "@/assets/mara-avatar.png.asset.json";

function NavLink({
  to,
  icon: Icon,
  label,
  active,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { patient, patients, setPatientId } = usePatient();
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-3">
            <img
              src={avatarAsset.url}
              alt="Mara"
              className={cn(
                "rounded-full object-cover ring-2 ring-primary/20",
                pathname === "/" ? "h-[144px] w-[144px]" : "h-[72px] w-[72px]",
              )}
              width={pathname === "/" ? 144 : 72}
              height={pathname === "/" ? 144 : 72}
            />
            <div className="leading-tight">
              <div className={cn("font-semibold text-foreground", pathname === "/" ? "text-6xl" : "text-3xl")}>
                Mara
              </div>
              <div className={cn("text-muted-foreground", pathname === "/" ? "text-xl" : "text-sm")}>
                AI Care Navigator
              </div>
            </div>
          </Link>

          <nav className="flex items-center gap-1">
            <NavLink to="/" icon={Stethoscope} label="Patient" active={pathname === "/"} />
            <NavLink to="/inbox" icon={Inbox} label="Scheduled calls" active={pathname === "/inbox"} />
            <NavLink to="/admin" icon={LayoutDashboard} label="Dashboard" active={pathname === "/admin"} />
          </nav>

          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-3">
              <span className="hidden text-xs uppercase tracking-wider text-muted-foreground sm:inline">
                Demo patient
              </span>
              <Select value={patient?.id ?? ""} onValueChange={setPatientId}>
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder="Select patient" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex flex-col py-1">
                        <span className="font-medium">{p.full_name}</span>
                        {p.address && (
                          <span className="text-xs text-muted-foreground">📍 {p.address}</span>
                        )}
                        {p.primary_provider && (
                          <span className="text-xs text-muted-foreground">
                            🩺 PCP: {p.primary_provider.name} · {p.primary_provider.specialty}
                          </span>
                        )}
                        {p.insurance && (
                          <span className="text-xs text-muted-foreground">
                            🛡️ {p.insurance.payer}
                            {p.insurance.plan ? ` · ${p.insurance.plan}` : ""}
                            {p.insurance.member_id ? ` · #${p.insurance.member_id}` : ""}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {patient && (
              <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
                {patient.address && <span>📍 {patient.address}</span>}
                {patient.primary_provider && (
                  <span>
                    🩺 PCP: {patient.primary_provider.name} · {patient.primary_provider.specialty}
                  </span>
                )}
                {patient.insurance && (
                  <span>
                    🛡️ {patient.insurance.payer}
                    {patient.insurance.plan ? ` · ${patient.insurance.plan}` : ""}
                    {patient.insurance.member_id ? ` · Member #${patient.insurance.member_id}` : ""}
                    {patient.insurance.referral_required ? " · referral required" : ""}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>

      <footer className="mx-auto mt-12 max-w-6xl px-4 pb-8 text-center text-xs text-muted-foreground">
        Hackathon demo — no real PHI, no live telephony. Mock data only.
      </footer>
    </div>
  );
}
