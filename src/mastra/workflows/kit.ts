import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { answersPrompt, cvPrompt, letterPrompt } from "@/lib/ai/prompts";
import { guardAnswers, guardCv, guardLetter, ledger, type GuardEvent } from "@/lib/cv/guard";
import { composeCv, type CvDocument } from "@/lib/cv/compose";
import { answersSchema, cvBodySchema, letterSchema, type Answers, type Fit, type Letter } from "@/lib/cv/schema";
import type { ScoredJob } from "@/lib/jobs/types";
import type { Profile } from "@/lib/profile/types";
import { reportGuard, traceStep } from "@/lib/server/telemetry";
import { structured, type Usage } from "../gemma";
import type { ModelChain } from "../model";

// The application kit as a Mastra workflow, after a swipe right:
//   cv ‖ letter ‖ answers  →  assemble
// The three writers run in parallel (on a laptop Ollama queues them; in the cloud they
// overlap, which the Sentry trace shows). Each one's output is guarded before assemble
// sees it, and every guard event is reported with the tier and model.

const passThrough = z.any();

export type KitInput = {
  job: ScoredJob;
  profile: Pick<Profile, "header" | "facts" | "neverClaim">;
  fit: Fit;
  include: { letter: boolean; answers: boolean };
};

type Part<T> = { value: T | null; events: GuardEvent[]; usage: Usage | null; error?: string };

export type Kit = {
  cv: CvDocument | null;
  letter: Letter | null;
  answers: Answers | null;
  events: GuardEvent[];
  usage: { inputTokens: number; outputTokens: number; ms: number };
  errors: string[];
};

const chainOf = (rc: { get: (k: string) => unknown }) => rc.get("chain") as ModelChain;
const where = (c: ModelChain) => ({ tier: c.tier, model: String(c.models[0]?.id ?? "unknown") });

const cvStep = createStep({
  id: "cv",
  description: "Gemma writes the tailored CV parts, citing facts; the guard drops anything it can't trace",
  inputSchema: passThrough,
  outputSchema: passThrough,
  execute: async ({ inputData, requestContext }): Promise<Part<CvDocument>> =>
    traceStep("cv", async () => {
      const { job, profile, fit } = inputData as KitInput;
      const chain = chainOf(requestContext);
      try {
        const { data, usage } = await structured("cv", "cvAgent", chain, cvPrompt(job, fit, profile.facts, profile.neverClaim), cvBodySchema, { maxOutputTokens: 3000 });
        const { body, events } = guardCv(data, ledger(profile.facts, profile.neverClaim), `${job.title}\n${job.description}`);
        reportGuard("cv", events, where(chain));
        return { value: composeCv(profile, body, fit), events, usage };
      } catch (e) {
        return { value: null, events: [], usage: null, error: e instanceof Error ? e.message : String(e) };
      }
    }),
});

const letterStep = createStep({
  id: "letter",
  description: "Gemma drafts a short cover letter that names the gaps; the guard drops invented claims",
  inputSchema: passThrough,
  outputSchema: passThrough,
  execute: async ({ inputData, requestContext }): Promise<Part<Letter>> =>
    traceStep("letter", async () => {
      const { job, profile, fit, include } = inputData as KitInput;
      if (!include.letter) return { value: null, events: [], usage: null };
      const chain = chainOf(requestContext);
      try {
        const { data, usage } = await structured("letter", "letterAgent", chain, letterPrompt(job, fit, profile.facts, profile.header), letterSchema, { maxOutputTokens: 1500, temperature: 0.4 });
        const { letter, events } = guardLetter(data, ledger(profile.facts, profile.neverClaim), job.description);
        reportGuard("letter", events, where(chain));
        return { value: letter, events, usage };
      } catch (e) {
        return { value: null, events: [], usage: null, error: e instanceof Error ? e.message : String(e) };
      }
    }),
});

const answersStep = createStep({
  id: "answers",
  description: "Gemma drafts answers to the usual form questions; salary and notice period are left for the user",
  inputSchema: passThrough,
  outputSchema: passThrough,
  execute: async ({ inputData, requestContext }): Promise<Part<Answers>> =>
    traceStep("answers", async () => {
      const { job, profile, include } = inputData as KitInput;
      if (!include.answers) return { value: null, events: [], usage: null };
      const chain = chainOf(requestContext);
      try {
        const { data, usage } = await structured("answers", "answersAgent", chain, answersPrompt(job, profile.facts), answersSchema, { maxOutputTokens: 1800, temperature: 0.4 });
        const { answers, events } = guardAnswers(data, ledger(profile.facts, profile.neverClaim), job.description);
        reportGuard("answers", events, where(chain));
        return { value: answers, events, usage };
      } catch (e) {
        return { value: null, events: [], usage: null, error: e instanceof Error ? e.message : String(e) };
      }
    }),
});

const assembleStep = createStep({
  id: "assemble",
  description: "One kit: the CV, letter and answers, every guard event, and what it cost in tokens",
  inputSchema: passThrough,
  outputSchema: passThrough,
  execute: async ({ inputData }): Promise<Kit> =>
    traceStep("assemble", async () => {
      const { cv, letter, answers } = inputData as { cv: Part<CvDocument>; letter: Part<Letter>; answers: Part<Answers> };
      const parts = [cv, letter, answers];
      const usages = parts.map((p) => p.usage).filter((u): u is Usage => Boolean(u));
      return {
        cv: cv.value,
        letter: letter.value,
        answers: answers.value,
        events: parts.flatMap((p) => p.events),
        usage: {
          inputTokens: usages.reduce((s, u) => s + u.inputTokens, 0),
          outputTokens: usages.reduce((s, u) => s + u.outputTokens, 0),
          ms: Math.max(0, ...usages.map((u) => u.ms)),
        },
        errors: parts.map((p) => p.error).filter((e): e is string => Boolean(e)),
      };
    }),
});

export const kitWorkflow = createWorkflow({ id: "application-kit", inputSchema: passThrough, outputSchema: passThrough })
  .parallel([cvStep, letterStep, answersStep])
  .then(assembleStep)
  .commit();
