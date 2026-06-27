/**
 * VoicePanel — wraps the ElevenLabs Agents conversation.
 * Uses runtime tools (client tools) so the agent can hit our DB without
 * needing webhook URLs configured in the ElevenLabs dashboard.
 * Persists transcript to call_logs for the admin dashboard.
 */
import { useConversation, ConversationProvider } from "@elevenlabs/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getElevenLabsConversationToken, analyzeAttachment } from "@/lib/elevenlabs.functions";
import type { ToolName } from "@/lib/agent-tools";
import { insertCallLog, finalizeCallLog, getPatientVoiceContext } from "@/lib/data.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, MicOff, Phone, PhoneOff, Loader2, AlertCircle, Paperclip, Camera, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Patient } from "@/lib/patient-context";
import avatarAsset from "@/assets/mara-avatar.png.asset.json";


type Turn = { role: "user" | "agent"; text: string; at: string };

export type Scenario = "new_booking" | "billing_explainer" | "reminder";

const SCENARIO_LABEL: Record<Scenario, string> = {
  new_booking: "Mara calling the doctor's office",
  billing_explainer: "Talk to Mara",
  reminder: "Appointment reminder",
};

const SCENARIO_OPENER: Record<Scenario, string> = {
  new_booking:
    "Hi there, this is Mara, an AI care navigator calling on behalf of a patient. Thank you so much for taking my call. I'd love to book a new appointment with one of your providers when you have a moment, please.",
  billing_explainer:
    "Hi there, this is Mara. I'm so glad to help you with your bills, insurance, upcoming appointments, or procedures — and I can also walk you through how to use this app. What would you like to start with today?",
  reminder:
    "Hi, this is Mara — just checking in with a friendly reminder about your upcoming visit. Would you like to confirm, reschedule, or have me answer any questions about it? I'm happy to help.",
};

type Props = {
  patient: Patient;
  scenario: Scenario;
  context?: Record<string, unknown>;
  onClose?: () => void;
};

export function VoicePanel(props: Props) {
  // Swallow ElevenLabs SDK's malformed error packets (it reads .error_type on
  // undefined and the unhandled rejection terminates the WebRTC session).
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = String(e.reason?.message ?? e.reason ?? "");
      if (msg.includes("error_type")) e.preventDefault();
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);
  return (
    <ConversationProvider>
      <VoicePanelInner {...props} />
    </ConversationProvider>
  );
}


function VoicePanelInner({ patient, scenario, context, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const autoStartedRef = useRef(false);

  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [attachments, setAttachments] = useState<
    Array<{ id: string; filename: string; mime: string; previewUrl?: string; status: "analyzing" | "ready" | "error"; summary?: string }>
  >([]);
  const callLogIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const agentVariant: "mara" | "mara_billing" = scenario === "billing_explainer" ? "mara_billing" : "mara";


  const conversation = useConversation({
    clientTools: {
      find_providers: (p) => runToolForAgent("find_providers", p, patient.id),
      check_availability: (p) => runToolForAgent("check_availability", p, patient.id),
      book_appointment: (p) =>
        runToolForAgent("book_appointment", { ...p, patient_id: patient.id }, patient.id),
      get_patient_profile: (p) =>
        runToolForAgent("get_patient_profile", { ...p, patient_id: patient.id }, patient.id),
      get_appointments: (p) =>
        runToolForAgent("get_appointments", { ...p, patient_id: patient.id }, patient.id),
      get_insurance_summary: (p) =>
        runToolForAgent("get_insurance_summary", { ...p, patient_id: patient.id }, patient.id),
      get_billing_summary: (p) =>
        runToolForAgent("get_billing_summary", { ...p, patient_id: patient.id }, patient.id),
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
      insertCallLog({
        data: { patient_id: patient.id, scenario, agent_session_id: sessionId },
      })
        .then((r) => {
          if (r?.id) callLogIdRef.current = r.id;
        })
        .catch(() => {});
    },
    onDisconnect: () => {
      if (callLogIdRef.current) {
        finalizeCallLog({
          data: {
            id: callLogIdRef.current,
            transcript: transcriptRef.current,
            outcome: "completed",
          },
        }).catch(() => {});
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
  const runAnalyze = useServerFn(analyzeAttachment);
  const fetchVoiceContext = useServerFn(getPatientVoiceContext);

  const start = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const [voiceContext, tokenResult] = await Promise.all([
        fetchVoiceContext({ data: { patient_id: patient.id } }),
        fetchToken({ data: { variant: agentVariant } }),
      ]);
      const { token } = tokenResult;

      const batch = context as
        | {
            providers?: { name: string; specialty: string; location: string }[];
            preferences?: {
              preferred_locations?: string;
              days?: string[];
              time_of_day?: string | string[];
              max_distance_miles?: number;
              notes?: string;
            };
          }
        | undefined;
      const providers = batch?.providers ?? [];
      const prefs = batch?.preferences;
      const primaryProvider = (voiceContext as any).primary_provider_summary as string;
      const insuranceSummary = (voiceContext as any).insurance_summary as string;
      let opener = SCENARIO_OPENER[scenario];
      if (scenario === "new_booking" && providers.length > 0) {
        const list = providers.map((p) => `${p.name} (${p.specialty}, ${p.location})`).join("; ");
        const prefLine = prefs
          ? ` The patient prefers ${Array.isArray(prefs.time_of_day) ? (prefs.time_of_day.length ? prefs.time_of_day.join(" or ") : "any time") : (prefs.time_of_day ?? "any time")} on ${(prefs.days ?? []).join(", ") || "any day"}${prefs.preferred_locations ? ` near ${prefs.preferred_locations}` : ""}${prefs.notes ? `. Notes: ${prefs.notes}` : ""}.`
          : "";
        opener = `Hi there, this is Mara, an AI care navigator calling on behalf of ${patient.full_name}. The referring primary care provider is ${primaryProvider}, and the insurance on file is ${insuranceSummary}. I have a batch of ${providers.length} offices to call to book a new appointment: ${list}.${prefLine} I'll work through them one at a time — starting with the first office now. Could you please help me find the next available slot? Thank you so much.`;
      }
      const useOverrides = scenario === "new_booking";
      await conversation.startSession({
        conversationToken: token,
        connectionType: "webrtc",
        ...(useOverrides
          ? {
              overrides: {
                agent: {
                  prompt: {
                    prompt: `You are Mara, a warm, kind, patient AI care navigator helping elderly patients with healthcare tasks. Keep sentences short, clear, and reassuring. Always be friendly and polite — use "please" and "thank you" naturally, greet warmly, and show care. End every call with a warm thank you AND a clear goodbye, such as "Thank you so much for your help today. Have a wonderful day, and goodbye!" Current demo patient profile: patient_name=${patient.full_name}; primary_provider=${primaryProvider}; insurance_summary=${insuranceSummary}. Use those patient profile variables exactly as given. If asked about the patient's profile, call get_patient_profile before answering. For this demo, the patient has a primary care referrer and insurance on file. Never describe the patient as self-referred, having no referrer, having no insurance, or insurance not being on file.`,
                  },
                  language: "en",
                },
              },
            }
          : {}),
      });

      // Inject context after connect (works without overrides allow-listing).
      const appointmentsSummary = (voiceContext as any).appointments_summary as string;
      const contextMsg = `Patient: ${patient.full_name}. Primary care provider on file: ${primaryProvider}. Insurance on file: ${insuranceSummary}. Upcoming appointments booked in this app: ${appointmentsSummary}. You can also call the get_appointments tool any time to refresh that list. Scenario: ${SCENARIO_LABEL[scenario]}. Always end the call with a warm thank you and a clear goodbye, like "Thank you so much for your time. Goodbye, and take care!" ${opener}`;
      setTimeout(() => {
        try {
          conversation.sendContextualUpdate?.(contextMsg);
        } catch {}
      }, 800);

    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to start";
      setError(message);
      toast.error("Couldn't start call", { description: message });
    } finally {
      setConnecting(false);
    }
  }, [conversation, fetchToken, fetchVoiceContext, patient, scenario, context, agentVariant]);

  // Auto-start "Talk with Mara" so the user doesn't press an extra button.
  useEffect(() => {
    if (scenario !== "billing_explainer") return;
    if (autoStartedRef.current) return;
    if (conversation.status !== "disconnected") return;
    autoStartedRef.current = true;
    start();
  }, [scenario, conversation.status, start]);

  // Scroll the call panel into view when the call connects.
  useEffect(() => {
    if (conversation.status === "connected") {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [conversation.status]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      for (const file of Array.from(files)) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const isImage = file.type.startsWith("image/");
        const previewUrl = isImage ? URL.createObjectURL(file) : undefined;
        setAttachments((prev) => [
          ...prev,
          { id, filename: file.name, mime: file.type || "application/octet-stream", previewUrl, status: "analyzing" },
        ]);
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error ?? new Error("read failed"));
            reader.readAsDataURL(file);
          });
          const { summary } = await runAnalyze({
            data: { data_url: dataUrl, mime: file.type || "application/octet-stream", filename: file.name },
          });
          setAttachments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, status: "ready", summary } : a)),
          );
          // Show in transcript and push to live agent if connected.
          setTranscript((prev) => {
            const next = [
              ...prev,
              {
                role: "user" as const,
                text: `📎 Shared "${file.name}" — Mara has reviewed it.\n\n${summary}`,
                at: new Date().toISOString(),
              },
            ];
            transcriptRef.current = next;
            return next;
          });
          if (conversation.status === "connected") {
            conversation.sendContextualUpdate?.(
              `The patient just shared an attachment named "${file.name}" (${file.type}). Here is what it shows:\n\n${summary}\n\nUse this to answer their questions about it.`,
            );
            toast.success("Attachment shared with Mara");
          } else {
            toast.success("Attachment analyzed — start the call to discuss");
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Couldn't analyze attachment";
          setAttachments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, status: "error", summary: msg } : a)),
          );
          toast.error("Attachment failed", { description: msg });
        }
      }
    },
    [conversation, runAnalyze],
  );

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }


  const stop = useCallback(async () => {
    await conversation.endSession();
    onClose?.();
  }, [conversation, onClose]);

  const isConnected = conversation.status === "connected";
  const isSpeaking = conversation.isSpeaking;

  return (
    <Card ref={panelRef} className="overflow-hidden border-2">
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
                : scenario === "billing_explainer"
                  ? `Talking to Mara — on behalf of ${patient.full_name}`
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
              {isSpeaking ? `${scenario === "billing_explainer" ? "Mara" : "Mara"} is speaking` : "Listening"}
            </div>
          )}
          {scenario === "billing_explainer" && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                hidden
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button variant="outline" size="lg" onClick={() => fileInputRef.current?.click()} className="gap-2">
                <Paperclip className="h-4 w-4" /> Attach bill / photo / PDF
              </Button>
              <Button variant="outline" size="lg" onClick={() => cameraInputRef.current?.click()} className="gap-2">
                <Camera className="h-4 w-4" /> Take photo
              </Button>
            </>
          )}
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="group relative flex items-center gap-2 rounded-md border border-border bg-background p-2 pr-8 text-xs"
              >
                {a.previewUrl ? (
                  <img src={a.previewUrl} alt={a.filename} className="h-10 w-10 rounded object-cover" />
                ) : (
                  <FileText className="h-10 w-10 text-muted-foreground" />
                )}
                <div className="max-w-[12rem]">
                  <div className="truncate font-medium">{a.filename}</div>
                  <div className="text-muted-foreground">
                    {a.status === "analyzing" && (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Analyzing…
                      </span>
                    )}
                    {a.status === "ready" && "Shared with Mara"}
                    {a.status === "error" && <span className="text-destructive">Failed</span>}
                  </div>
                </div>
                <button
                  onClick={() => removeAttachment(a.id)}
                  className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground hover:bg-muted"
                  aria-label="Remove attachment"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}


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
                ? `Listening… speak naturally. ${scenario === "billing_explainer" ? "Mara" : "Mara"} will reply out loud.`
                : `Press Start call to begin. You'll hear ${scenario === "billing_explainer" ? "Mara" : "Mara"} through your speakers.`}
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
                {t.role === "agent" ? (scenario === "billing_explainer" ? "Mara" : "Mara") : patient.full_name}
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
      <img
        src={avatarAsset.url}
        alt="Mara"
        className={cn(
          "h-28 w-28 rounded-full border-2 object-cover transition-all",
          active
            ? speaking
              ? "border-primary shadow-lg shadow-primary/30"
              : "border-primary/60"
            : "border-muted-foreground/40 opacity-80 grayscale",
        )}
        width={112}
        height={112}
      />
      {active && speaking && (
        <div className="absolute inset-0 animate-ping rounded-full border-2 border-primary/60" />
      )}
      {active && speaking && (
        <div className="absolute -inset-1 rounded-full border border-primary/30" />
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
