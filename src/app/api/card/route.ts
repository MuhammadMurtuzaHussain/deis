import { z } from "zod";
import { cardPrompt } from "@/lib/ai/prompts";
import { cardSchema, type CardWhy } from "@/lib/ai/schema";
import { scrub } from "@/lib/cv/compose";
import { bareIds, inlineIds, ledger, resolveCitations, stripCitations, whyNotLine, type GuardEvent } from "@/lib/cv/guard";
import { houseStyle } from "@/lib/cv/style";
import type { ScoredJob } from "@/lib/jobs/types";
import { aiFor, body, factsInputSchema, jobInputSchema, modelFailure } from "@/lib/server/api";
import { reportGuard } from "@/lib/server/telemetry";
import { structured } from "@/mastra/gemma";

export const runtime = "nodejs";
export const maxDuration = 90;

const schema = z.object({ job: jobInputSchema, facts: factsInputSchema, neverClaim: z.array(z.string().max(120)).max(30).default([]) });

const WEIGHT = { strong: 1, transferable: 0.5, gap: 0 } as const;

// Three "why" lines for the card about to show. Cached on the device, so each job costs one call at most.
export async function POST(req: Request) {
  // A bad body never counts against the hourly limit.
  const input = await body(req, schema);
  if (input instanceof Response) return input;
  const ai = await aiFor(req, "light", 200);
  if (ai instanceof Response) return ai;
  try {
    const job = input.job as unknown as ScoredJob;
    const { data, usage } = await structured("card", "cardAgent", ai.chain, cardPrompt(job, input.facts, input.neverClaim), cardSchema, { maxOutputTokens: 400 });
    const l = ledger(input.facts, input.neverClaim);
    const events: GuardEvent[] = [];
    const why = data.why.slice(0, 3).flatMap((w) => {
      // Small models sometimes cite inline ("…dashboards [rm5]", or bare "rm5") and leave the list empty; both count.
      const facts = resolveCitations([...w.facts, ...inlineIds(w.text), ...bareIds(w.text, l)], l);
      const text = scrub(houseStyle(stripCitations(w.text, l)));
      // A "strong" line with no real fact behind it reads as a gap instead.
      const kind = w.kind !== "gap" && !facts.length ? "gap" : w.kind;
      // A gap line may name the posting's tools; a match line must stand on its facts.
      const rule = whyNotLine(text, facts, l, kind, job.description);
      if (rule) {
        events.push({ rule, text });
        return [];
      }
      return text ? [{ kind, text, facts }] : [];
    });
    reportGuard("card", events, { tier: ai.chain.tier, model: String(ai.chain.models[0]?.id) });
    // Derived by code from the guarded lines; Gemma's own score was never shown.
    const score = Math.round((100 * why.reduce((s, w) => s + WEIGHT[w.kind], 0)) / Math.max(1, why.length));
    return Response.json({ why, score, usage } satisfies CardWhy & { usage: unknown });
  } catch (e) {
    return modelFailure(e, ai);
  }
}
