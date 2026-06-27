/**
 * ElevenLabs server-tool webhook. Configure each server tool in the
 * ElevenLabs Agent dashboard to POST here at:
 *   {published-url}/api/public/agent-tools/{tool_name}
 * with a JSON body of the tool parameters.
 *
 * Public route — protected only by demo scope. In production add an
 * HMAC signature from ElevenLabs and verify it before dispatch.
 */
import { createFileRoute } from "@tanstack/react-router";
import { runTool, type ToolName } from "@/lib/agent-tools";

const ALLOWED: ToolName[] = [
  "find_providers",
  "check_availability",
  "book_appointment",
  "get_insurance_summary",
  "get_billing_summary",
  "request_human_transfer",
];

export const Route = createFileRoute("/api/public/agent-tools/$")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const toolName = params._splat as ToolName;
        if (!ALLOWED.includes(toolName)) {
          return Response.json({ error: `Unknown tool: ${toolName}` }, { status: 404 });
        }
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          body = {};
        }
        try {
          const result = await runTool(toolName, body);
          return Response.json(result);
        } catch (err) {
          console.error(`Tool ${toolName} failed`, err);
          return Response.json(
            { error: err instanceof Error ? err.message : "tool_failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
