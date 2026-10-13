import { z } from "zod";
import { proposalPrompt } from "@/lib/ai/prompts";
import { houseStyle } from "@/lib/cv/style";
import { proposalSchema } from "@/lib/cv/schema";
import { aiFor, body, modelFailure } from "@/lib/server/api";
import { structured } from "@/mastra/gemma";

export const runtime = "nodejs";
export const maxDuration = 90;

const schema = z.object({
  need: z.string().max(200),
  question: z.string().max(300),
  answer: z.string().min(2).max(2000),
  orgs: z.array(z.string().max(200)).max(20),
});

// Turn the user's own answer into proposed facts. They join the profile only if the user approves them.
export async function POST(req: Request) {
  const ai = await aiFor(req, "light", 60);
  if (ai instanceof Response) return ai;
  const input = await body(req, schema);
  if (input instanceof Response) return input;
  try {
    const { data } = await structured("proposals", "coachAgent", ai.chain, proposalPrompt(input.need, input.question, input.answer, input.orgs), proposalSchema, { maxOutputTokens: 600, temperature: 0.1 });
    return Response.json({ proposals: data.proposals.map((p) => ({ ...p, text: houseStyle(p.text) })) });
  } catch (e) {
    return modelFailure(e, ai);
  }
}
