import { z } from "zod";
import { aiFor, modelFailure } from "@/lib/server/api";
import { structured } from "@/mastra/gemma";

export const runtime = "nodejs";
export const maxDuration = 120;

// "Test connection" on the model setup screen: one tiny structured call, timed, with the
// host that actually answered (after a failover it isn't the first one asked).
export async function POST(req: Request) {
  const ai = await aiFor(req, "light", 30);
  if (ai instanceof Response) return ai;
  try {
    const { data, usage } = await structured("card", "cardAgent", ai.chain, 'Reply with {"ok": true}.', z.object({ ok: z.boolean() }), { maxOutputTokens: 30 });
    const answeredBy = [usage.host, usage.model && `(${usage.model})`].filter(Boolean).join(" ") || null;
    return Response.json({ ok: data.ok, ms: usage.ms, model: ai.chain.label, tier: ai.chain.tier, answeredBy });
  } catch (e) {
    return modelFailure(e, ai);
  }
}
