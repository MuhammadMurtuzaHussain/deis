import { z } from "zod";
import { aiFor, modelFailure } from "@/lib/server/api";
import { structured } from "@/mastra/gemma";

export const runtime = "nodejs";
export const maxDuration = 120;

// "Test connection" on the model setup screen: one tiny structured call, timed.
export async function POST(req: Request) {
  const ai = await aiFor(req, "light", 30);
  if (ai instanceof Response) return ai;
  try {
    const { data, usage } = await structured("card", "cardAgent", ai.chain, 'Reply with {"ok": true}.', z.object({ ok: z.boolean() }), { maxOutputTokens: 30 });
    return Response.json({ ok: data.ok, ms: usage.ms, model: ai.chain.label, tier: ai.chain.tier });
  } catch (e) {
    return modelFailure(e, ai);
  }
}
