import { z } from "zod";
import { gapQuestionsPrompt } from "@/lib/ai/prompts";
import { houseStyle } from "@/lib/cv/style";
import { fitSchema, gapQuestionsSchema } from "@/lib/cv/schema";
import type { ScoredJob } from "@/lib/jobs/types";
import { aiFor, body, jobInputSchema, modelFailure } from "@/lib/server/api";
import { structured } from "@/mastra/gemma";

export const runtime = "nodejs";
export const maxDuration = 90;

const schema = z.object({ job: jobInputSchema, fit: fitSchema });

// Careful lane: a few kind questions about the gaps, so real experience the CV missed can surface.
export async function POST(req: Request) {
  const ai = await aiFor(req, "light", 60);
  if (ai instanceof Response) return ai;
  const input = await body(req, schema);
  if (input instanceof Response) return input;
  if (!input.fit.requirements.some((r) => r.match !== "strong")) return Response.json({ questions: [] });
  try {
    const { data } = await structured("questions", "coachAgent", ai.chain, gapQuestionsPrompt(input.job as unknown as ScoredJob, input.fit), gapQuestionsSchema, { maxOutputTokens: 800, temperature: 0.4 });
    return Response.json({ questions: data.questions.slice(0, 4).map((q) => ({ need: q.need, question: houseStyle(q.question) })) });
  } catch (e) {
    return modelFailure(e, ai);
  }
}
