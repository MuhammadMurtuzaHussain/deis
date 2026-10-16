import { z } from "zod";
import { fitPrompt } from "@/lib/ai/prompts";
import { scrub } from "@/lib/cv/compose";
import { guardFit, ledger, whyNot, whyNotLine, type GuardEvent, type Ledger } from "@/lib/cv/guard";
import { fitSchema, type Fit } from "@/lib/cv/schema";
import type { ScoredJob } from "@/lib/jobs/types";
import { aiFor, body, factsInputSchema, jobInputSchema, modelFailure } from "@/lib/server/api";
import { reportGuard, traceWorkflow } from "@/lib/server/telemetry";
import { structured } from "@/mastra/gemma";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({ job: jobInputSchema, facts: factsInputSchema, neverClaim: z.array(z.string().max(120)).max(30).default([]) });

/** "Python or JavaScript", "tools such as Git", "(Ruby, Go are preferred)": a list of options, not every tool in it. */
const OPTIONS = /\b(or|such as|e\.g\.|for example|like|including|any of|one of|preferred|ideally|nice to have|a plus|bonus)\b/i;

/**
 * Code's half of the fit check. "Strong" on "Java and Spring Boot" needs both in the cited
 * facts, or it only carries over. Notes and the angle go into the CV prompt and onto the
 * screen, so they may claim nothing the facts don't back.
 */
function tighten(fit: Fit, l: Ledger, posting: string): { fit: Fit; events: GuardEvent[] } {
  const events: GuardEvent[] = [];
  const requirements = fit.requirements.map((r) => {
    const missing = r.match === "strong" && !OPTIONS.test(r.need) && ["unsupported_tool", "unsupported_cert"].includes(whyNot(r.need.replace(/\d/g, ""), r.facts, l, { requireFacts: false }) ?? "");
    if (missing) events.push({ rule: "fit_demoted", text: r.need });
    const match = missing ? ("transferable" as const) : r.match;
    const rule = r.note ? whyNotLine(r.note, r.facts, l, match === "gap" ? "gap" : "note", posting) : null;
    if (rule) events.push({ rule, text: r.note });
    return { ...r, match, need: scrub(r.need), note: rule ? "" : scrub(r.note) };
  });
  const angleRule = fit.angle ? whyNotLine(fit.angle, [], l, "angle") : null;
  if (angleRule) events.push({ rule: angleRule, text: fit.angle });
  return { fit: { ...fit, requirements, angle: angleRule ? "" : scrub(fit.angle) }, events };
}

// The honest fit check both lanes start with: must-haves matched to facts, gaps named.
export async function POST(req: Request) {
  // A bad body never counts against the hourly limit.
  const input = await body(req, schema);
  if (input instanceof Response) return input;
  const ai = await aiFor(req, "careful", 60);
  if (ai instanceof Response) return ai;
  try {
    const job = input.job as unknown as ScoredJob;
    const { data, usage } = await traceWorkflow("fit-check", () =>
      structured("fit", "fitAgent", ai.chain, fitPrompt(job, input.facts, input.neverClaim), fitSchema, { maxOutputTokens: 1500 }),
    );
    const l = ledger(input.facts, input.neverClaim);
    const guarded = guardFit(data, l);
    const { fit, events } = tighten(guarded.fit, l, job.description);
    const all = [...guarded.events, ...events];
    reportGuard("fit", all, { tier: ai.chain.tier, model: String(ai.chain.models[0]?.id) });
    return Response.json({ fit, events: all, usage, model: ai.chain.label });
  } catch (e) {
    return modelFailure(e, ai);
  }
}
