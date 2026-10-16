import { z } from "zod";
import { gapQuestionsPrompt } from "@/lib/ai/prompts";
import { WORK_STATUS } from "@/lib/cv/guard";
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
  const input = await body(req, schema);
  if (input instanceof Response) return input;
  // No gaps, no model call, so nothing to count.
  if (!input.fit.requirements.some((r) => r.match !== "strong")) return Response.json({ questions: [] });
  const ai = await aiFor(req, "light", 60);
  if (ai instanceof Response) return ai;
  try {
    const { data } = await structured("questions", "coachAgent", ai.chain, gapQuestionsPrompt(input.job as unknown as ScoredJob, input.fit), gapQuestionsSchema, { maxOutputTokens: 800, temperature: 0.4 });
    // Right to work comes from the user's settings, so Deis never asks about it here.
    const questions = data.questions.filter((q) => !WORK_STATUS.test(`${q.need} ${q.question}`)).slice(0, 4);
    return Response.json({ questions: questions.map((q) => ({ need: q.need, question: houseStyle(q.question) })) });
  } catch (e) {
    return modelFailure(e, ai);
  }
}
