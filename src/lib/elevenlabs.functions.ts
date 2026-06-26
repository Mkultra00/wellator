import { createServerFn } from "@tanstack/react-start";

/**
 * Mint a single-use WebRTC conversation token for the ElevenLabs Agent.
 * Keeps ELEVENLABS_API_KEY server-side. The client uses just the token.
 */
export const getElevenLabsConversationToken = createServerFn({ method: "POST" }).handler(
  async () => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const agentId = process.env.ELEVENLABS_AGENT_ID;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured");
    if (!agentId) throw new Error("ELEVENLABS_AGENT_ID is not configured");

    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": apiKey } },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ElevenLabs token request failed: ${res.status} ${body}`);
    }

    const data = (await res.json()) as { token: string };
    return { token: data.token, agentId };
  },
);
