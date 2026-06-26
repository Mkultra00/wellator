/**
 * VoicePanel — wraps the ElevenLabs Agents conversation.
 * Uses runtime tools (client tools) so the agent can hit our DB without
 * needing webhook URLs configured in the ElevenLabs dashboard.
 * Persists transcript to call_logs for the admin dashboard.
 */
import { useConversation } from "@elevenlabs/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getElevenLabsConversationToken } from "@/lib/elevenlabs.functions";
import type { ToolName } from "@/lib/agent-tools";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, MicOff, Phone, PhoneOff, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Patient } from "@/lib/patient-context";

type Turn = { role: "user" | "agent"; text: string; at: string };

export type Scenario = "new_booking" | "pt_followup" | "billing_explainer" | "reminder";

const SCENARIO_LABEL: Record<Scenario, string> = {
  new_booking: "Mara calling the doctor's office",
  pt_followup: "Physical therapy follow-up",
  billing_explainer: "Help with a bill or benefit",
  reminder: "Appointment reminder",
};

const SCENARIO_OPENER: Record<Scenario, string> = {
  new_booking:
    "Hi, this is Mara, an AI care navigator calling on behalf of a patient. I'd like to book a new appointment with one of your providers. Do you have a moment?",
  pt_followup:
    "Hi, this is Mara following up after your physical therapy visit. Do you have a couple of minutes for a few quick questions?",
  billing_explainer:
    "Hi, this is Mara. I can help explain a recent bill or insurance statement in plain language. Which bill would you like to look at?",
  reminder:
    "Hi, this is Mara — a friendly reminder about your upcoming visit. Would you like to confirm, reschedule, or have me answer any questions about it?",
};

type Props = {
  patient: Patient;
  scenario: Scenario;
  context?: Record<string, unknown>;
  onClose?: () => void;
};

export function VoicePanel({ patient, scenario, context, onClose }: Props) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const callLogIdRef = useRef<string | null>(null);

  const conversation = useConversation({
    clientTools: {
      find_providers: (p) => runToolForAgent("find_providers", p, patient.id),
      check_availability: (p) => runToolForAgent("check_availability", p, patient.id),
      book_appointment: (p) =>
        runToolForAgent("book_appointment", { ...p, patient_id: patient.id }, patient.id),
      get_insurance_summary: (p) =>
        runToolForAgent("get_insurance_summary", { ...p, patient_id: patient.id }, patient.id),
      get_billing_summary: (p) =>
        runToolForAgent("get_billing_summary", { ...p, patient_id: patient.id }, patient.id),
      record_pt_feedback: (p) =>
        runToolForAgent("record_pt_feedback", { ...p, patient_id: patient.id }, patient.id),
      request_human_transfer: (p) => {
        toast.info("Marked for human follow-up", {
          description: typeof p.reason === "string" ? p.reason : undefined,
        });
        return runToolForAgent(
          "request_human_transfer",
          { ...p, patient_id: patient.id, session_id: conversation.getId?.() ?? "" },
          patient.id,
        );
      },
    },
    onConnect: () => {
      const sessionId = conversation.getId?.() ?? null;
      supabase
        .from("call_logs")
        .insert({
          patient_id: patient.id,
          scenario,
          agent_session_id: sessionId,
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single()
        .then(({ data }) => {
          if (data) callLogIdRef.current = data.id as string;
        });
    },
    onDisconnect: () => {
      if (callLogIdRef.current) {
        supabase
          .from("call_logs")
          .update({
            ended_at: new Date().toISOString(),
            transcript: transcriptRef.current,
            outcome: "completed",
          })
          .eq("id", callLogIdRef.current)
          .then(() => {});
      }
    },
    onMessage: (msg: { source?: string; message?: string }) => {
      const text = msg.message ?? "";
      const role: "user" | "agent" = msg.source === "user" ? "user" : "agent";
      if (!text) return;
      setTranscript((prev) => {
        const next = [...prev, { role, text, at: new Date().toISOString() }];
        transcriptRef.current = next;
        return next;
      });
    },
    onError: (e: unknown) => {
      const message = typeof e === "string" ? e : e instanceof Error ? e.message : "Connection error";
      setError(message);
      toast.error("Voice error", { description: message });
    },
  });

  const transcriptRef = useRef<Turn[]>([]);
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const fetchToken = useServerFn(getElevenLabsConversationToken);

  const start = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { token } = await fetchToken();
      const selected = (context as { selected_provider?: { name: string; specialty: string; location: string } } | undefined)?.selected_provider;
      const opener =
        scenario === "new_booking" && selected
          ? `Hi, this is Mara, an AI care navigator calling on behalf of ${patient.full_name}. I'm calling ${selected.name}'s office (${selected.specialty}, ${selected.location}) to book a new appointment. Could you help me find the next available slot?`
          : SCENARIO_OPENER[scenario];
      await conversation.startSession({
        conversationToken: token,
        connectionType: "webrtc",
        dynamicVariables: {
          patient_id: patient.id,
          patient_name: patient.full_name,
          preferred_language: patient.preferred_language,
          accessibility_notes: patient.accessibility_notes ?? "",
          scenario,
          scenario_label: SCENARIO_LABEL[scenario],
          opener,
          context_json: JSON.stringify(context ?? {}),
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to start";
      setError(message);
      toast.error("Couldn't start call", { description: message });
    } finally {
      setConnecting(false);
    }
  }, [conversation, fetchToken, patient, scenario, context]);

  const stop = useCallback(async () => {
    await conversation.endSession();
    onClose?.();
  }, [conversation, onClose]);

  const isConnected = conversation.status === "connected";
  const isSpeaking = conversation.isSpeaking;

  return (
    <Card className="overflow-hidden border-2">
      <div
        className={cn(
          "flex flex-col gap-4 p-6 transition-colors",
          isConnected ? "bg-primary/5" : "bg-muted/30",
        )}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {SCENARIO_LABEL[scenario]}
            </div>
            <div className="mt-1 text-lg font-semibold">
              {scenario === "new_booking"
                ? `Mara is calling the office on behalf of ${patient.full_name}`
                : `Talking to Mara — on behalf of ${patient.full_name}`}
            </div>
          </div>
          <VoiceOrb active={isConnected} speaking={isSpeaking} />
        </div>

        {patient.accessibility_notes && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{patient.accessibility_notes}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!isConnected ? (
            <Button size="lg" onClick={start} disabled={connecting} className="gap-2">
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
              {connecting ? "Connecting…" : "Start call"}
            </Button>
          ) : (
            <Button size="lg" variant="destructive" onClick={stop} className="gap-2">
              <PhoneOff className="h-4 w-4" /> End call
            </Button>
          )}
          {isConnected && (
            <div className="flex items-center gap-1 rounded-md bg-background px-3 py-2 text-sm text-muted-foreground">
              {isSpeaking ? <Mic className="h-4 w-4 text-primary" /> : <MicOff className="h-4 w-4" />}
              {isSpeaking ? "Mara is speaking" : "Listening"}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-background p-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Live transcript
        </div>
        <div className="max-h-72 space-y-3 overflow-y-auto pr-2">
          {transcript.length === 0 && (
            <div className="text-sm text-muted-foreground">
              {isConnected
                ? "Listening… speak naturally. Mara will reply out loud."
                : "Press Start call to begin. You'll hear Mara through your speakers."}
            </div>
          )}
          {transcript.map((t, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                t.role === "agent"
                  ? "bg-primary/10 text-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              <div className="mb-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t.role === "agent" ? "Mara" : patient.full_name}
              </div>
              {t.text}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function VoiceOrb({ active, speaking }: { active: boolean; speaking: boolean }) {
  return (
    <div className="relative">
      <div
        className={cn(
          "h-14 w-14 rounded-full border-2 transition-all",
          active
            ? speaking
              ? "border-primary bg-primary animate-pulse"
              : "border-primary bg-primary/30"
            : "border-muted-foreground/40 bg-muted",
        )}
      />
      {active && speaking && (
        <div className="absolute inset-0 animate-ping rounded-full border-2 border-primary/60" />
      )}
    </div>
  );
}

async function runToolForAgent(
  name: ToolName,
  params: Record<string, unknown>,
  patientId: string,
): Promise<string> {
  try {
    const res = await fetch(`/api/public/agent-tools/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, patient_id: params.patient_id ?? patientId }),
    });
    const data = await res.json();
    return JSON.stringify(data);
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : "tool_failed" });
  }
}
