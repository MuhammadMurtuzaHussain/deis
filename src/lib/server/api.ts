import { z } from "zod";
import { AI_HEADER, decodeSettings, type AiSettings } from "../ai/settings";
import { factSchema, headerSchema } from "../profile/types";
import { modelChain, SettingsRejected, type Effort, type ModelChain } from "@/mastra/model";
import { demoLimited, LIMIT_MESSAGES, retryAfter } from "./limits";

// Shared plumbing for the AI routes: read the user's model settings from the header,
// build the model chain, apply the demo key's rate limit, and turn failures into
// messages a person can act on.

export type Ai = { settings: AiSettings; chain: ModelChain };

export const jsonError = (error: string, message: string, status: number) => Response.json({ error, message }, { status });

/** Call after body(), so a request that was going to fail anyway doesn't count against the limit. */
export async function aiFor(req: Request, effort: Effort, perHour = 60): Promise<Ai | Response> {
  const refused = crossSite(req);
  if (refused) return refused;
  const settings = decodeSettings(req.headers.get(AI_HEADER)) ?? { provider: "demo" as const };
  try {
    const chain = modelChain(settings, effort);
    const limit = await demoLimited(req, settings, perHour);
    if (limit) return Response.json({ error: "rate_limited", limit, message: LIMIT_MESSAGES[limit] }, { status: 429, headers: { "retry-after": String(retryAfter(limit)) } });
    return { settings, chain };
  } catch (e) {
    // Offline mode is a state the app can show and wait out, not a bad setting.
    if (e instanceof SettingsRejected && e.code === "DEIS_OFFLINE") return jsonError("offline", e.message, 503);
    if (e instanceof SettingsRejected) return jsonError("settings_rejected", e.message, 400);
    throw e;
  }
}

/** The error and what it wraps: fetch and Mastra keep a `cause`, AI SDK retries a `lastError`. */
function unwrap(e: unknown): unknown[] {
  const seen: unknown[] = [];
  const queue = [e];
  while (queue.length && seen.length < 12) {
    const x = queue.shift();
    if (x == null || seen.includes(x)) continue;
    seen.push(x);
    if (typeof x === "object") {
      const o = x as { cause?: unknown; lastError?: unknown; errors?: unknown };
      queue.push(o.cause, o.lastError, ...(Array.isArray(o.errors) ? o.errors.slice(-3) : []));
    }
  }
  return seen;
}

// No route to the host at all: DNS, no network, or a network that drops everything.
const NETWORK = /\b(ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ENETDOWN|UND_ERR_CONNECT_TIMEOUT)\b|fetch failed|Cannot connect to API/i;
// Ollama answered the connection but not in time (undici's own header and body timeouts).
const SLOW = /\b(UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT)\b|Headers Timeout Error|Body Timeout Error/i;

/** What went wrong talking to the model, in words for the user. */
export function modelFailure(e: unknown, ai: Ai): Response {
  const errors = unwrap(e);
  const codes = errors.map((x) => (x as { code?: unknown }).code).filter((c): c is string => typeof c === "string");
  const statuses = errors.map((x) => (x as { statusCode?: unknown }).statusCode).filter((c): c is number => typeof c === "number");
  const msg = [...codes, ...errors.map((x) => (x instanceof Error ? x.message : typeof x === "string" ? x : ""))].join(" | ");
  console.error("[ai]", ai.chain.label, msg.slice(0, 300));
  if (codes.includes("DEIS_OFFLINE")) return jsonError("offline", "Deis is in offline mode. Choose Gemma on this computer in Settings.", 503);
  if (ai.chain.tier === "local") {
    if (SLOW.test(msg)) return jsonError("model_timeout", "Gemma is taking longer than expected on this computer. Try again, or choose a smaller model in Settings.", 504);
    if (/ECONNREFUSED|fetch failed|connect/i.test(msg)) {
      if (ai.settings.provider !== "ollama") return jsonError("model_unreachable", `Couldn't reach ${ai.chain.label}. Is the server running?`, 502);
      return jsonError("model_unreachable", "Couldn't reach Ollama on this computer. Is it running? Open the Ollama app, then try again.", 502);
    }
  } else if (NETWORK.test(msg) && !SLOW.test(msg)) {
    // On the hosted demo the server is the one that's cut off, so the user's own setup can't help.
    const hint = process.env.DEIS_HOSTED === "1" ? "Try again in a minute." : "Check your internet connection, or choose Gemma on this computer in Settings.";
    return jsonError("network", `Couldn't reach the AI host. ${hint}`, 503);
  }
  // Not "invalid" on its own: AI Studio says "Request contains an invalid argument" for bad requests, not bad keys.
  if (statuses.some((s) => s === 401 || s === 403) || /API key|API_KEY|\b40[13]\b|\bpermission/i.test(msg)) return jsonError("model_auth", "The AI provider didn't accept the key. Check it in Settings.", 502);
  // Word-bounded: a bare "rate" matched "generateContent" in Google's 404 for a wrong model name.
  if (statuses.includes(429) || /\b429\b|\bquota|\brate.?limit|RESOURCE_EXHAUSTED|too many requests/i.test(msg)) return jsonError("model_quota", "The AI provider says you've hit its free limit for now. Try again in a minute, or switch provider in Settings.", 502);
  if (statuses.includes(404) || /not found|\b404\b|\bpull/i.test(msg)) return jsonError("model_missing", `The model isn't available: ${ai.chain.label}. Check the model name in Settings.`, 502);
  const hint = ai.chain.tier === "local" ? "Try again; on a laptop the first run can be slow." : ai.chain.tier === "demo" ? "The demo's Gemma host is busy. Try again in a minute." : "Try again.";
  return jsonError("model_failed", `Gemma didn't give a usable answer this time. ${hint}`, 502);
}

// ---- Request bodies. The job and facts come from the user's own device, so these
// limits are about cost and abuse on the hosted demo, not trust.

export const jobInputSchema = z
  .object({
    id: z.string().max(40),
    title: z.string().max(300),
    company: z.string().max(200),
    location: z.string().max(300),
    city: z.string().max(80),
    description: z.string().max(12000),
  })
  .passthrough();

export const factsInputSchema = z.array(factSchema).max(150);

export const profileInputSchema = z.object({
  header: headerSchema,
  facts: factsInputSchema,
  neverClaim: z.array(z.string().max(120)).max(30).default([]),
});

export async function body<T>(req: Request, schema: z.ZodType<T>): Promise<T | Response> {
  const refused = crossSite(req);
  if (refused) return refused;
  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "bad_request", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  return parsed.data;
}

/**
 * Only Deis's own page may call these routes. A web page elsewhere can POST plain text or a
 * form without asking, but sending JSON makes the browser ask first, and Deis never says yes.
 * The hosted demo also checks the Origin when there is one (the desktop app's feed requests have none).
 */
function crossSite(req: Request): Response | null {
  const type = req.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return jsonError("unsupported_media_type", "Deis only accepts JSON here.", 415);
  const origin = req.headers.get("origin");
  if (process.env.DEIS_HOSTED !== "1" || !origin) return null;
  try {
    const own = process.env.SITE_URL ? new URL(process.env.SITE_URL).host : req.headers.get("host");
    if (new URL(origin).host === own) return null;
  } catch {
    // "null" or a malformed Origin: refuse
  }
  return jsonError("forbidden", "This request didn't come from Deis.", 403);
}
