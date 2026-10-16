import { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";
import { CV_LENGTHS, fitSchema } from "@/lib/cv/schema";
import { aiFor, body, jobInputSchema, jsonError, modelFailure, profileInputSchema } from "@/lib/server/api";
import { traceWorkflow } from "@/lib/server/telemetry";
import { mastra } from "@/mastra";
import type { Kit, KitInput } from "@/mastra/workflows/kit";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  job: jobInputSchema,
  profile: profileInputSchema,
  fit: fitSchema,
  include: z.object({ letter: z.boolean(), answers: z.boolean() }),
  lane: z.enum(["quick", "careful"]).default("quick"),
  length: z.enum(CV_LENGTHS).default("detailed"),
});

/** A failed workflow's error arrives as a plain object, not an Error. */
const failure = (e: unknown) => (e instanceof Error ? e.message : ((e as { message?: string } | null)?.message ?? JSON.stringify(e)));

// After a swipe right: the tailored CV, an optional letter and draft answers, all guarded.
export async function POST(req: Request) {
  // A bad body never counts against the hourly limit.
  const input = await body(req, schema);
  if (input instanceof Response) return input;
  const ai = await aiFor(req, "writing", 20);
  if (ai instanceof Response) return ai;
  try {
    const run = await mastra.getWorkflow("kitWorkflow").createRun();
    const out = await traceWorkflow("application-kit", () =>
      run.start({ inputData: input as unknown as KitInput, requestContext: new RequestContext([["chain", ai.chain]]) }),
    );
    if (out.status !== "success") return jsonError("kit_failed", failure(out.status === "failed" ? out.error : out.status), 502);
    const kit = out.result as Kit;
    if (!kit.cv) return modelFailure(new Error(kit.errors.join("; ") || "no cv"), ai);
    return Response.json({ ...kit, model: ai.chain.label });
  } catch (e) {
    return modelFailure(e, ai);
  }
}
