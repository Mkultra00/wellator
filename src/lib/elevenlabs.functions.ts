import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Mint a WebRTC conversation token for the requested ElevenLabs Agent variant.
 * - "mara" (default): generic Mara agent (booking/PT/billing fallback)
 * - "marie" (UI name: Mara): billing/insurance Q&A agent
 */
export const getElevenLabsConversationToken = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ variant: z.enum(["mara", "marie"]).optional() }).optional().parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured");

    const variant = data?.variant ?? "mara";
    const agentId =
      variant === "marie"
        ? process.env.ELEVENLABS_MARIE_AGENT_ID
        : process.env.ELEVENLABS_AGENT_ID;
    if (!agentId) throw new Error(`ElevenLabs agent id for variant "${variant}" is not configured`);

    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": apiKey } },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ElevenLabs token request failed: ${res.status} ${body}`);
    }

    const json = (await res.json()) as { token: string };
    return { token: json.token, agentId, variant };
  });

/**
 * Vision/document analysis for an attachment shared during a Marie/Mara chat.
 * Uses Lovable AI Gateway (Gemini) to extract the key info from a bill,
 * insurance card, EOB, or appointment letter, so the live voice agent can
 * discuss it after we push the summary in via sendContextualUpdate.
 */
export const analyzeAttachment = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        data_url: z.string().min(20), // data:<mime>;base64,...
        mime: z.string().min(3),
        filename: z.string().optional(),
        user_note: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const isImage = data.mime.startsWith("image/");
    const isPdf = data.mime === "application/pdf";

    const content: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `You are helping a voice agent (Mara/Marie) discuss a medical billing or insurance document with an elderly patient.

The patient just attached: ${data.filename ?? "an attachment"} (${data.mime}).
${data.user_note ? `They added this note: "${data.user_note}"` : ""}

Extract the practical info the voice agent needs in PLAIN LANGUAGE. Keep it under 180 words. Use this structure:

**Document type:** (bill / EOB / insurance card / appointment letter / other)
**Who it's from:** provider / payer name
**Key numbers:** total due, patient responsibility, insurance paid, dates of service, claim # — whichever apply
**What it means:** 1-2 plain-language sentences a 75-year-old can understand
**Suggested next step:** one concrete action

If something is unreadable, say so honestly.`,
      },
    ];

    if (isImage) {
      content.push({ type: "image_url", image_url: { url: data.data_url } });
    } else if (isPdf) {
      content.push({
        type: "file",
        file: { filename: data.filename ?? "document.pdf", file_data: data.data_url },
      });
    } else {
      // Unsupported binary — fall back to filename/note only
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Attachment analysis failed: ${res.status} ${body}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const summary = json.choices?.[0]?.message?.content?.trim() ?? "";
    return { summary };
  });
