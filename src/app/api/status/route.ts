import { kvBackend } from "@/lib/server/kv";
import { sentryEnabled } from "@/lib/server/telemetry";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    hosted: process.env.DEIS_HOSTED === "1",
    desktop: process.env.DEIS_DESKTOP === "1",
    demoModel: Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.FALLBACK_BASE_URL),
    services: { cache: kvBackend(), jobSearch: Boolean(process.env.SERPAPI_KEY), tracing: sentryEnabled() },
  });
}
