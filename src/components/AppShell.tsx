import { Link, useLocation } from "@tanstack/react-router";
import { usePatient } from "@/lib/patient-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Stethoscope, Inbox, LayoutDashboard, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

function NavLink({
  to,
  icon: Icon,
  label,
  active,
}: {
  to: string;
  icon: typeof Mic;
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
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Mic className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-base font-semibold text-foreground">Mara</div>
              <div className="text-xs text-muted-foreground">AI Care Navigator</div>
            </div>
          </Link>

          <nav className="flex items-center gap-1">
            <NavLink to="/" icon={Stethoscope} label="Patient" active={pathname === "/"} />
            <NavLink to="/inbox" icon={Inbox} label="Scheduled calls" active={pathname === "/inbox"} />
            <NavLink to="/admin" icon={LayoutDashboard} label="Dashboard" active={pathname === "/admin"} />
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden text-xs uppercase tracking-wider text-muted-foreground sm:inline">
              Demo patient
            </span>
            <Select value={patient?.id ?? ""} onValueChange={setPatientId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select patient" />
              </SelectTrigger>
              <SelectContent>
                {patients.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
