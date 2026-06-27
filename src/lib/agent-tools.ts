/**
 * Tool contracts called by the agent (both from the browser client tools
 * and from /api/public/agent-tools webhook for ElevenLabs server tools).
 *
 * Demo mode: queries run with the anon Supabase client (open RLS).
 * Swap-in for prod: scope to auth.uid() and tighten policies.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

async function getServerSupabase(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as SupabaseClient;
}

export type ToolName =
  | "find_providers"
  | "check_availability"
  | "book_appointment"
  | "get_patient_profile"
  | "get_appointments"
  | "get_insurance_summary"
  | "get_billing_summary"
  | "request_human_transfer";

export async function runTool(
  name: ToolName,
  params: Record<string, unknown>,
  supabase?: SupabaseClient,
): Promise<unknown> {
  const db = supabase ?? (await getServerSupabase());
  switch (name) {
    case "find_providers": {
      const { specialty, location } = params as { specialty?: string; location?: string };
      let q = db.from("providers").select("id,name,specialty,location,accepts_insurance");
      if (specialty) q = q.ilike("specialty", `%${specialty}%`);
      if (location) q = q.ilike("location", `%${location}%`);
      const { data, error } = await q.limit(10);
      if (error) throw error;
      return { providers: data ?? [] };
    }
    case "check_availability": {
      const { provider_id, earliest_date } = params as {
        provider_id: string;
        earliest_date?: string;
      };
      const start = earliest_date ?? new Date().toISOString();
      const { data, error } = await db
        .from("slots")
        .select("id,starts_at,ends_at")
        .eq("provider_id", provider_id)
        .eq("status", "open")
        .gte("starts_at", start)
        .order("starts_at", { ascending: true })
        .limit(6);
      if (error) throw error;
      return { slots: data ?? [] };
    }
    case "book_appointment": {
      const { patient_id, slot_id, reason } = params as {
        patient_id: string;
        slot_id: string;
        reason?: string;
      };
      // Conditional update: only book if still open (prevents double-book).
      const { data: slotRow, error: slotErr } = await db
        .from("slots")
        .update({ status: "booked" })
        .eq("id", slot_id)
        .eq("status", "open")
        .select("id,provider_id,starts_at")
        .maybeSingle();
      if (slotErr) throw slotErr;
      if (!slotRow) return { ok: false, reason: "slot_no_longer_available" };

      const { data: insuranceRow } = await db
        .from("insurance_profiles")
        .select("payer,plan")
        .eq("patient_id", patient_id)
        .maybeSingle();

      const { data: appt, error: apptErr } = await db
        .from("appointments")
        .insert({
          patient_id,
          provider_id: slotRow.provider_id,
          slot_id: slotRow.id,
          starts_at: slotRow.starts_at,
          reason: reason ?? null,
          insurance_snapshot: insuranceRow ?? null,
          created_via: "voice_agent",
        })
        .select("id,starts_at")
        .single();
      if (apptErr) throw apptErr;
      return { ok: true, appointment_id: appt.id, starts_at: appt.starts_at };
    }
    case "get_patient_profile": {
      const { patient_id } = params as { patient_id: string };
      const { data, error } = await db
        .from("patients")
        .select(
          "id,full_name,preferred_language,accessibility_notes,primary_provider:providers!patients_primary_provider_id_fkey(name,specialty,clinic_address),insurance_profiles(payer,plan,referral_required)",
        )
        .eq("id", patient_id)
        .maybeSingle();
      if (error) throw error;
      const insuranceProfiles = (data as any)?.insurance_profiles;
      const insurance = Array.isArray(insuranceProfiles)
        ? insuranceProfiles[0] ?? null
        : insuranceProfiles ?? null;
      const primary = (data as any)?.primary_provider ?? null;
      return {
        patient: data
          ? {
              id: (data as any).id,
              full_name: (data as any).full_name,
              primary_provider: primary,
              insurance,
              primary_provider_summary: primary
                ? `${primary.name} (${primary.specialty})`
                : "primary care provider on file in demo profile",
              insurance_summary: insurance?.payer
                ? `${insurance.payer}${insurance.plan ? ` — ${insurance.plan}` : ""}${insurance.referral_required ? ", referral required" : ""}`
                : "insurance on file in demo profile",
            }
          : null,
      };
    }
    case "get_appointments": {
      const { patient_id } = params as { patient_id: string };
      // Booked appointments live in call_logs (scenario='booking_call'),
      // saved by the BatchCallSimulator. outcome is a JSON string.
      const { data, error } = await db
        .from("call_logs")
        .select("id,started_at,outcome,transcript")
        .eq("patient_id", patient_id)
        .eq("scenario", "booking_call")
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const appointments = (data ?? [])
        .map((row) => {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = row.outcome ? JSON.parse(row.outcome) : {};
          } catch {
            return null;
          }
          if (parsed.status !== "booked") return null;
          return {
            call_log_id: row.id,
            booked_at: row.started_at,
            slot: parsed.slot ?? null,
            provider_name: parsed.provider_name ?? null,
            provider_specialty: parsed.provider_specialty ?? null,
            provider_location: parsed.provider_location ?? null,
          };
        })
        .filter(Boolean);
      return { appointments };
    }
    case "get_insurance_summary": {
      const { patient_id } = params as { patient_id: string };
      const { data, error } = await db
        .from("insurance_profiles")
        .select("payer,plan,referral_required,copay_cents")
        .eq("patient_id", patient_id)
        .maybeSingle();
      if (error) throw error;
      return { insurance: data };
    }
    case "get_billing_summary": {
      const { patient_id, bill_id } = params as { patient_id: string; bill_id?: string };
      let q = db
        .from("bills")
        .select("id,amount_cents,status,line_items,issued_at,eobs(payer_paid_cents,patient_responsibility_cents,denial_reason,plain_language_summary)")
        .eq("patient_id", patient_id);
      if (bill_id) q = q.eq("id", bill_id);
      const { data, error } = await q.order("issued_at", { ascending: false }).limit(5);
      if (error) throw error;
      return { bills: data ?? [] };
    }
    case "request_human_transfer": {
      const { patient_id, reason, session_id } = params as {
        patient_id: string;
        reason: string;
        session_id?: string;
      };
      const { error } = await db
        .from("call_logs")
        .update({ human_transfer_requested: true, transfer_reason: reason })
        .eq("agent_session_id", session_id ?? "")
        .eq("patient_id", patient_id);
      if (error) console.error("transfer update failed", error);
      return { ok: true, message: "A human teammate will follow up shortly." };
    }
    default:
      throw new Error(`Unknown tool: ${name as string}`);
  }
}
