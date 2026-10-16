import { z } from "zod";
import { extractPrompt } from "@/lib/ai/prompts";
import { extractSchema, tidyFacts } from "@/lib/ai/schema";
import { aiFor, body, modelFailure } from "@/lib/server/api";
import { traceWorkflow } from "@/lib/server/telemetry";
import { structured } from "@/mastra/gemma";

export const runtime = "nodejs";
export const maxDuration = 180;

const schema = z.object({ source: z.enum(["cv", "linkedin"]), text: z.string().min(40).max(30000) });

// CV or LinkedIn text → header and facts. The user confirms every fact before it's used.
export async function POST(req: Request) {
  // A bad body never counts against the hourly limit.
  const input = await body(req, schema);
  if (input instanceof Response) return input;
  const ai = await aiFor(req, "careful", 10);
  if (ai instanceof Response) return ai;
  try {
    const { data, usage } = await traceWorkflow("import-profile", () =>
      structured("import", "importAgent", ai.chain, extractPrompt(input.source, input.text), extractSchema, { maxOutputTokens: 6000, temperature: 0.1 }),
    );
    return Response.json({ ...data, facts: tidyFacts(data.facts, input.text), usage, model: ai.chain.label });
  } catch (e) {
    return modelFailure(e, ai);
  }
}
