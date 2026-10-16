import { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";
import { CV_LENGTHS, fitSchema } from "@/lib/cv/schema";
import { KIT_STREAM, stepEvent, type KitStreamLine } from "@/lib/kit-progress";
import { aiFor, body, jobInputSchema, jsonError, modelFailure, profileInputSchema, type Ai } from "@/lib/server/api";
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

type Run = Awaited<ReturnType<Workflow["createRun"]>>;
type Workflow = ReturnType<typeof mastra.getWorkflow<"kitWorkflow">>;
type Outcome = Awaited<ReturnType<Run["start"]>>;

/** The finished run as the route's answer: the kit, or the error a person can act on. */
function answer(out: Outcome, ai: Ai): Response {
  if (out.status !== "success") return jsonError("kit_failed", failure(out.status === "failed" ? out.error : out.status), 502);
  const kit = out.result as Kit;
  if (!kit.cv) return modelFailure(new Error(kit.errors.join("; ") || "no cv"), ai);
  return Response.json({ ...kit, model: ai.chain.label });
}

/**
 * The same run, streamed: one line per step as it starts and finishes (names and counts,
 * never text), then the answer as one more line. One request, so the rate limit counts it
 * once, as before; the model calls are the workflow's own.
 */
function streamed(run: Run, start: Parameters<Run["start"]>[0], ai: Ai): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: KitStreamLine) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      let res: Response;
      try {
        res = await traceWorkflow("application-kit", async () => {
          const stream = run.stream(start);
          for await (const chunk of stream) {
            const e = stepEvent(chunk as Parameters<typeof stepEvent>[0]);
            if (e) send(e);
          }
          return answer((await stream.result) as Outcome, ai);
        });
      } catch (e) {
        res = modelFailure(e, ai);
      }
      const data = await res.json();
      send(res.ok ? { type: "result", data } : { type: "error", status: res.status, error: data.error, message: data.message });
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": KIT_STREAM, "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
}

// After a swipe right: the tailored CV, an optional letter and draft answers, all guarded.
export async function POST(req: Request) {
  // A bad body never counts against the hourly limit.
  const input = await body(req, schema);
  if (input instanceof Response) return input;
  const ai = await aiFor(req, "writing", 20);
  if (ai instanceof Response) return ai;
  try {
    const run = await mastra.getWorkflow("kitWorkflow").createRun();
    const start = { inputData: input as unknown as KitInput, requestContext: new RequestContext<unknown>([["chain", ai.chain]]) };
    if (req.headers.get("accept")?.includes(KIT_STREAM)) return streamed(run, start, ai);
    return answer(await traceWorkflow("application-kit", () => run.start(start)), ai);
  } catch (e) {
    return modelFailure(e, ai);
  }
}
