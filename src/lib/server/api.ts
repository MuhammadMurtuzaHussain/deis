import { z } from "zod";
import { AI_HEADER, decodeSettings, type AiSettings } from "../ai/settings";
import { factSchema, headerSchema } from "../profile/types";
import { modelChain, SettingsRejected, type Effort, type ModelChain } from "@/mastra/model";
import { demoLimited } from "./limits";

// Shared plumbing for the AI routes: read the user's model settings from the header,
// build the model chain, apply the demo key's rate limit, and turn failures into
// messages a person can act on.

export type Ai = { settings: AiSettings; chain: ModelChain };

export const jsonError = (error: string, message: string, status: number) => Response.json({ error, message }, { status });

export async function aiFor(req: Request, effort: Effort, perHour = 60): Promise<Ai | Response> {
  const settings = decodeSettings(req.headers.get(AI_HEADER)) ?? { provider: "demo" as const };
  try {
    const chain = modelChain(settings, effort);
    if (await demoLimited(req, settings, perHour)) {
      return jsonError("rate_limited", "The demo's free Gemma is busy. Add your own free Google AI Studio key in Settings to keep going.", 429);
    }
    return { settings, chain };
  } catch (e) {
    if (e instanceof SettingsRejected) return jsonError("settings_rejected", e.message, 400);
    throw e;
  }
}

/** What went wrong talking to the model, in words for the user. */
export function modelFailure(e: unknown, ai: Ai): Response {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[ai]", ai.chain.label, msg.slice(0, 300));
  if (/ECONNREFUSED|fetch failed|connect/i.test(msg) && ai.chain.tier === "local") {
    if (ai.settings.provider !== "ollama") return jsonError("model_unreachable", `Couldn't reach ${ai.chain.label}. Is the server running?`, 502);
    return jsonError("model_unreachable", "Couldn't reach Ollama on this computer. Is it running? Open the Ollama app, then try again.", 502);
  }
  // Not "invalid" on its own: AI Studio says "Request contains an invalid argument" for bad requests, not bad keys.
  if (/API key|API_KEY|\b40[13]\b|permission/i.test(msg)) return jsonError("model_auth", "The AI provider didn't accept the key. Check it in Settings.", 502);
  if (/429|quota|rate/i.test(msg)) return jsonError("model_quota", "The AI provider says you've hit its free limit for now. Try again in a minute, or switch provider in Settings.", 502);
  if (/not found|404|pull/i.test(msg)) return jsonError("model_missing", `The model isn't available: ${ai.chain.label}. Check the model name in Settings.`, 502);
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
  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "bad_request", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  return parsed.data;
}
