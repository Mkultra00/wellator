/**
 * Server functions for sensitive data tables.
 * These tables (patients, call_logs, scheduled_calls, appointments,
 * pt_feedback, etc.) are no longer reachable from the browser via the
 * publishable key — all access flows through service-role queries here.
 *
 * Demo note: this is currently UNAUTHENTICATED. Add real auth + an
 * authorization check (e.g. requireSupabaseAuth + has_role) before going
 * to production; otherwise these endpoints are a public bypass.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const listPatients = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data, error } = await db
    .from("patients")
    .select("id,full_name,dob,preferred_language,accessibility_notes,persona_note,primary_provider_id")
    .order("full_name");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listReferralNetwork = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ patient_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: pat, error: pErr } = await db
      .from("patients")
      .select("primary_provider_id")
      .eq("id", data.patient_id)
      .single();
    if (pErr) throw new Error(pErr.message);
    const primaryId = pat?.primary_provider_id ?? null;

    const { data: primary } = primaryId
      ? await db
          .from("providers")
          .select("id,name,specialty,location,accepts_insurance,is_primary,distance_miles")
          .eq("id", primaryId)
          .maybeSingle()
      : { data: null };

    let specialists: any[] = [];
    if (primaryId) {
      const { data: refs, error: rErr } = await db
        .from("provider_referrals")
        .select("specialist:providers!provider_referrals_specialist_id_fkey(id,name,specialty,location,accepts_insurance,is_primary,distance_miles)")
        .eq("primary_id", primaryId);
      if (rErr) throw new Error(rErr.message);
      specialists = (refs ?? []).map((r: any) => r.specialist).filter(Boolean);
    }
    return { primary: primary ?? null, specialists };
  });



export const listScheduledCalls = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data, error } = await db
    .from("scheduled_calls")
    .select("id,patient_id,scenario,due_at,status,context,patients(full_name)")
    .order("due_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const updateScheduledCallStatus = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), status: z.enum(["completed", "skipped", "pending"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db
      .from("scheduled_calls")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const insertCallLog = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        patient_id: z.string().uuid(),
        scenario: z.string(),
        agent_session_id: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: row, error } = await db
      .from("call_logs")
      .insert({
        patient_id: data.patient_id,
        scenario: data.scenario,
        agent_session_id: data.agent_session_id ?? null,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const finalizeCallLog = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        transcript: z.array(z.any()),
        outcome: z.string().default("completed"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db
      .from("call_logs")
      .update({
        ended_at: new Date().toISOString(),
        transcript: data.transcript,
        outcome: data.outcome,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDashboardData = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const [appts, calls, feedback] = await Promise.all([
    db
      .from("appointments")
      .select("id,starts_at,status,reason,patient_id,provider_id,patients(full_name),providers(name,specialty,location)")
      .order("starts_at", { ascending: false })
      .limit(50),
    db
      .from("call_logs")
      .select("id,scenario,outcome,started_at,ended_at,transcript,human_transfer_requested,transfer_reason,patient_id,patients(full_name)")
      .order("started_at", { ascending: false })
      .limit(50),
    db
      .from("pt_feedback")
      .select("id,pain_0_10,mobility_change,adherence,comment,recorded_at,patient_id,patients(full_name)")
      .order("recorded_at", { ascending: false })
      .limit(50),
  ]);
  if (appts.error) throw new Error(appts.error.message);
  if (calls.error) throw new Error(calls.error.message);
  if (feedback.error) throw new Error(feedback.error.message);
  return {
    appointments: appts.data ?? [],
    call_logs: calls.data ?? [],
    pt_feedback: feedback.data ?? [],
  };
});
