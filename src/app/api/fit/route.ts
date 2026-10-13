import { z } from "zod";
import { fitPrompt } from "@/lib/ai/prompts";
import { guardFit, ledger } from "@/lib/cv/guard";
import { fitSchema } from "@/lib/cv/schema";
import type { ScoredJob } from "@/lib/jobs/types";
import { aiFor, body, factsInputSchema, jobInputSchema, modelFailure } from "@/lib/server/api";
import { reportGuard, traceWorkflow } from "@/lib/server/telemetry";
import { structured } from "@/mastra/gemma";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({ job: jobInputSchema, facts: factsInputSchema });

// The honest fit check both lanes start with: must-haves matched to facts, gaps named.
export async function POST(req: Request) {
  const ai = await aiFor(req, "careful", 60);
  if (ai instanceof Response) return ai;
  const input = await body(req, schema);
  if (input instanceof Response) return input;
  try {
    const { data, usage } = await traceWorkflow("fit-check", () =>
      structured("fit", "fitAgent", ai.chain, fitPrompt(input.job as unknown as ScoredJob, input.facts), fitSchema, { maxOutputTokens: 1500 }),
    );
    const { fit, events } = guardFit(data, ledger(input.facts, []));
    reportGuard("fit", events, { tier: ai.chain.tier, model: String(ai.chain.models[0]?.id) });
    return Response.json({ fit, events, usage, model: ai.chain.label });
  } catch (e) {
    return modelFailure(e, ai);
  }
}
