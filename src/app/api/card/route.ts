import { z } from "zod";
import { cardPrompt } from "@/lib/ai/prompts";
import { cardSchema } from "@/lib/ai/schema";
import { cleanId } from "@/lib/cv/guard";
import { houseStyle } from "@/lib/cv/style";
import type { ScoredJob } from "@/lib/jobs/types";
import { aiFor, body, factsInputSchema, jobInputSchema, modelFailure } from "@/lib/server/api";
import { structured } from "@/mastra/gemma";

export const runtime = "nodejs";
export const maxDuration = 90;

const schema = z.object({ job: jobInputSchema, facts: factsInputSchema });

// Three "why" lines for the card about to show. Cached on the device, so each job costs one call at most.
export async function POST(req: Request) {
  const ai = await aiFor(req, "light", 200);
  if (ai instanceof Response) return ai;
  const input = await body(req, schema);
  if (input instanceof Response) return input;
  try {
    const { data, usage } = await structured("card", "cardAgent", ai.chain, cardPrompt(input.job as unknown as ScoredJob, input.facts), cardSchema, { maxOutputTokens: 500 });
    const known = new Set(input.facts.filter((f) => f.confirmed).map((f) => f.id));
    // A "strong" line with no real fact behind it reads as a gap instead.
    const why = data.why.map((w) => {
      const facts = w.facts.map(cleanId).filter((id) => known.has(id));
      return { ...w, text: houseStyle(w.text.replace(/\s*\[[^\]]*\]/g, "")), facts, kind: w.kind !== "gap" && !facts.length ? ("gap" as const) : w.kind };
    });
    return Response.json({ why, score: Math.round(data.score), usage });
  } catch (e) {
    return modelFailure(e, ai);
  }
}
