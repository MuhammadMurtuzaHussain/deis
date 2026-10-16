import { kvBackend, kvPing } from "@/lib/server/kv";
import { lastReachable, offlineMode } from "@/lib/server/net";
import { sentryEnabled } from "@/lib/server/telemetry";
import { demoHosts } from "@/mastra/model";

export const runtime = "nodejs";

// What this server can do, for the app and for checking a deploy. No keys, no URLs.
export async function GET() {
  const hosts = demoHosts();
  return Response.json({
    ok: true,
    // Render sets this on every deploy; the app links the source at this exact commit (AGPL).
    commit: process.env.RENDER_GIT_COMMIT?.slice(0, 12) ?? null,
    hosted: process.env.DEIS_HOSTED === "1",
    desktop: process.env.DEIS_DESKTOP === "1",
    demoModel: hosts.length > 0,
    // reachable: whether the last request to the internet got an answer (absent until one is tried).
    offline: { mode: offlineMode(), reachable: lastReachable() },
    demoHosts: hosts,
    services: { jobSearch: Boolean(process.env.SERPAPI_KEY), tracing: sentryEnabled(), cache: kvBackend(), cachePing: await kvPing() },
  });
}
