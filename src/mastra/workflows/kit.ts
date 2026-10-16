import type { Mastra } from "@mastra/core/mastra";
import { EntityType, type AnySpan } from "@mastra/core/observability";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { answersPrompt, cvPrompt, formQuestions, letterPrompt, YOURS_TO_ANSWER, type Lane } from "@/lib/ai/prompts";
import { guardAnswers, guardCv, guardLetter, ledger, splitSentences, type GuardEvent, type GuardRepair } from "@/lib/cv/guard";
import { composeCv, scrub, type CvDocument } from "@/lib/cv/compose";
import { answersDraftSchema, bodyFromDraft, cvDraftSchema, GUARD_VERSION, letterSchema, type Answers, type AnswersDraft, type CvBody, type CvDraft, type CvLength, type Fit, type Letter } from "@/lib/cv/schema";
import type { ScoredJob } from "@/lib/jobs/types";
import type { Profile } from "@/lib/profile/types";
import { serverEnvironment } from "@/lib/sentry-env";
import { reportGuard, traceStep } from "@/lib/server/telemetry";
import { structured, type Usage } from "../gemma";
import type { ModelChain } from "../model";
import { kitScoringEnabled } from "../observability";
import { scoreKit } from "../scorers";

// The application kit as a Mastra workflow, after a swipe right:
//   cv ‖ letter ‖ answers  →  assemble  →  checks
// The three writers run in parallel (on a laptop Ollama queues them; in the cloud they
// overlap, which the Sentry trace shows). Each one's output is guarded before assemble
// sees it, and every guard event is reported with the tier and model. Checks scores the
// finished kit with code (src/mastra/scorers.ts) and passes it on unchanged.

const passThrough = z.any();

export type KitInput = {
  job: ScoredJob;
  profile: Pick<Profile, "header" | "facts" | "neverClaim">;
  fit: Fit;
  include: { letter: boolean; answers: boolean };
  /** Quick lane letters don't name gaps; the Careful lane has asked about them first. */
  lane?: Lane;
  /** Two pages (the default) or one. */
  length?: CvLength;
};

type Part<T> = { value: T | null; events: GuardEvent[]; repairs?: GuardRepair[]; usage: Usage | null; error?: string };

export type Kit = {
  cv: CvDocument | null;
  letter: Letter | null;
  answers: Answers | null;
  events: GuardEvent[];
  /** Lines the guard kept by adding a citation from the same employer, rather than dropping them. */
  repairs: GuardRepair[];
  usage: { inputTokens: number; outputTokens: number; ms: number };
  /** A part that failed (letter, answers) while the rest of the kit was written. */
  errors: string[];
  /** Which guard rules checked this kit (GUARD_VERSION). */
  guardVersion: number;
};

const chainOf = (rc: { get: (k: string) => unknown }) => rc.get("chain") as ModelChain;
const where = (c: ModelChain) => ({ tier: c.tier, model: String(c.models[0]?.id ?? "unknown") });
/** Letters and answers read better a little looser; a small local model wanders above 0.3. */
const proseTemperature = (c: ModelChain) => (c.tier === "local" ? 0.3 : 0.4);
const addUsage = (a: Usage, b: Usage): Usage => ({ inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, ms: a.ms + b.ms });

const PARTS = ["profile", "competencies", "roles", "projects"] as const;
type PartName = (typeof PARTS)[number];
const sizes = (b: CvBody): Record<PartName, number> => ({
  profile: [...(b.objective ?? []), ...b.summary, ...(b.aim ?? [])].flatMap((s) => splitSentences(s.text)).length,
  competencies: b.competencies.length,
  roles: b.roles.reduce((n, r) => n + r.bullets.length, 0),
  projects: b.projects.length,
});

/** Sections the guard emptied (the profile) or cut by more than 30%: worth asking once more. */
export function weakParts(before: CvBody, after: CvBody): PartName[] {
  const a = sizes(before);
  const b = sizes(after);
  return PARTS.filter((p) => (p === "profile" && b.profile === 0) || (a[p] >= 2 && (a[p] - b[p]) / a[p] > 0.3));
}

/** Puts one guarded part into the body. The profile lives in three fields: the opening sentence (objective), the summary and the closing aim. */
const take = (body: CvBody, from: CvBody, p: PartName): CvBody => (p === "profile" ? { ...body, objective: from.objective, summary: from.summary, aim: from.aim } : { ...body, [p]: from[p] });
/** The draft with one part filled, so the guard's events are about that part alone. */
const onlyPart = (d: CvDraft, p: PartName): CvDraft => (p === "profile" ? { profile: d.profile, aim: d.aim } : { profile: [], [p]: d[p] });

const cvStep = createStep({
  id: "cv",
  description: "Gemma writes the tailored CV parts, citing facts; the guard drops anything it can't trace",
  inputSchema: passThrough,
  outputSchema: passThrough,
  execute: async ({ inputData, requestContext }): Promise<Part<CvDocument>> =>
    traceStep("cv", async () => {
      const { job, profile, fit, length = "detailed" } = inputData as KitInput;
      const chain = chainOf(requestContext);
      const l = ledger(profile.facts, profile.neverClaim);
      const posting = `${job.title}\n${job.description}`;
      const write = (retry?: Parameters<typeof cvPrompt>[4]) =>
        // A two-page CV is about 1,000 words of JSON with fact ids: room for that and a little more.
        structured("cv", "cvAgent", chain, cvPrompt(job, fit, profile.facts, profile.neverClaim, retry, length), cvDraftSchema, { maxOutputTokens: length === "short" ? 3500 : 6000, temperature: 0.2 });
      const confirmed = profile.facts.filter((f) => f.confirmed);
      try {
        const first = await write();
        const draft = bodyFromDraft(first.data, confirmed);
        let { body, events, repairs } = guardCv(draft, l, posting);
        let usage = first.usage;
        // One targeted retry, quoting the rules that bit. If it does no better, compose falls back to the facts.
        const weak = weakParts(draft, body);
        if (weak.length) {
          try {
            const again = await write({ parts: weak, rules: [...new Set(events.map((e) => e.rule))] });
            usage = addUsage(usage, again.usage);
            // A retried part replaces the first only when more of it survives the guard.
            for (const p of weak) {
              const checked = guardCv(bodyFromDraft(onlyPart(again.data, p), confirmed), l, posting);
              if (sizes(checked.body)[p] <= sizes(body)[p]) continue;
              body = take(body, checked.body, p);
              events = [...events, ...checked.events];
              repairs = [...repairs, ...checked.repairs];
            }
          } catch {
            // The first try stands.
          }
        }
        reportGuard("cv", events, where(chain));
        return { value: composeCv(profile, body, fit, undefined, length), events, repairs, usage };
      } catch (e) {
        return { value: null, events: [], usage: null, error: e instanceof Error ? e.message : String(e) };
      }
    }),
});

const GREETING = /^(?:dear [^,.\n]{0,40},|to whom it may concern,?)\s*/i;
const SIGN_OFF = /(?:^|(?<=[.!?])\s+)(?:yours sincerely|yours faithfully|sincerely|kind regards|best regards|warm regards|best wishes|regards),?(?:\s+[\p{L}'’.-]+){0,3}\s*$/iu;
/** A letter can't open "For instance," once the guard dropped the sentence before it. */
const LEADING_LINK = /^(?:for instance|for example|furthermore|additionally|moreover|in addition|also|similarly|as a result),?\s+/i;

/** Code adds "Dear Hiring Team," and "Kind regards," (src/lib/cv/docx.ts), so the model's own go. */
export function tidyLetter(paragraphs: Letter["paragraphs"]): Letter["paragraphs"] {
  const out = paragraphs.map((p, i) => {
    let text = scrub(p.text);
    if (i === 0) text = text.replace(GREETING, "").replace(LEADING_LINK, "");
    if (i === paragraphs.length - 1) text = text.replace(SIGN_OFF, "").trim();
    return { ...p, text: text.charAt(0).toUpperCase() + text.slice(1) };
  });
  return out.filter((p) => p.text);
}

const letterStep = createStep({
  id: "letter",
  description: "Gemma drafts a short cover letter; the guard drops invented claims",
  inputSchema: passThrough,
  outputSchema: passThrough,
  execute: async ({ inputData, requestContext }): Promise<Part<Letter>> =>
    traceStep("letter", async () => {
      const { job, profile, fit, include, lane } = inputData as KitInput;
      if (!include.letter) return { value: null, events: [], usage: null };
      const chain = chainOf(requestContext);
      try {
        const prompt = letterPrompt(job, fit, profile.facts, profile.header, { lane, neverClaim: profile.neverClaim });
        const { data, usage } = await structured("letter", "letterAgent", chain, prompt, letterSchema, { maxOutputTokens: 1500, temperature: proseTemperature(chain) });
        const { letter, events, repairs } = guardLetter(data, ledger(profile.facts, profile.neverClaim), job.description);
        reportGuard("letter", events, where(chain));
        return { value: { paragraphs: tidyLetter(letter.paragraphs) }, events, repairs, usage };
      } catch (e) {
        return { value: null, events: [], usage: null, error: e instanceof Error ? e.message : String(e) };
      }
    }),
});

/** Code writes the questions, including the two only the candidate can answer. */
export function answersFrom(d: AnswersDraft, company: string): Answers {
  const q = formQuestions(company);
  const keys = ["why_company", "why_fit", "proud_of"] as const;
  return {
    answers: [
      ...keys.map((k) => ({ question: q[k], answer: d[k].answer.trim(), facts: d[k].facts, needsYou: !d[k].answer.trim() })),
      ...YOURS_TO_ANSWER.map((question) => ({ question, answer: "", facts: [], needsYou: true })),
    ],
  };
}

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
        const { data, usage } = await structured("answers", "answersAgent", chain, answersPrompt(job, profile.facts, profile.neverClaim), answersDraftSchema, {
          maxOutputTokens: 1800,
          temperature: proseTemperature(chain),
        });
        const { answers, events, repairs } = guardAnswers(answersFrom(data, job.company), ledger(profile.facts, profile.neverClaim), job.description);
        reportGuard("answers", events, where(chain));
        return { value: { answers: answers.answers.map((a) => ({ ...a, answer: scrub(a.answer) })) }, events, repairs, usage };
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
        repairs: parts.flatMap((p) => p.repairs ?? []),
        usage: {
          inputTokens: usages.reduce((s, u) => s + u.inputTokens, 0),
          outputTokens: usages.reduce((s, u) => s + u.outputTokens, 0),
          ms: Math.max(0, ...usages.map((u) => u.ms)),
        },
        errors: (["cv", "letter", "answers"] as const).flatMap((name, i) => (parts[i].error ? [`${name}: ${parts[i].error}`] : [])),
        guardVersion: GUARD_VERSION,
      };
    }),
});

/** Sends each kit score to Mastra, on the workflow run's trace. Never throws: a score is never worth a kit. */
async function sendScores(init: KitInput, kit: Kit, mastra: Mastra | undefined, step: AnySpan | undefined) {
  let run = step?.isValid ? step : undefined;
  while (run?.parent && run.type !== "workflow_run") run = run.parent;
  const observability = mastra?.observability;
  if (!run || !observability?.addScore) return;
  try {
    const scores = await scoreKit({ job: init.job, facts: init.profile.facts }, kit);
    const correlationContext = run.getCorrelationContext?.();
    for (const score of scores) {
      await observability.addScore({
        traceId: run.traceId,
        spanId: run.id,
        correlationContext,
        score: { ...score, scoreSource: "live", targetEntityType: EntityType.WORKFLOW_RUN, metadata: { environment: serverEnvironment(process.env) } },
      });
    }
  } catch {
    // Monitoring only.
  }
}

const checksStep = createStep({
  id: "checks",
  description: "Code scores the finished kit, no model: untraceable items, near-copy lines, tense, prompt leaks, guard removals. The kit passes through unchanged",
  inputSchema: passThrough,
  outputSchema: passThrough,
  execute: async ({ inputData, getInitData, mastra, tracingContext }): Promise<Kit> => {
    const kit = inputData as Kit;
    if (kitScoringEnabled()) await sendScores(getInitData<KitInput>(), kit, mastra, tracingContext?.currentSpan);
    return kit;
  },
});

// No snapshots: a run's input is someone's name, email and facts, and Mastra's default store keeps every run in memory.
export const kitWorkflow = createWorkflow({ id: "application-kit", inputSchema: passThrough, outputSchema: passThrough, options: { shouldPersistSnapshot: () => false } })
  .parallel([cvStep, letterStep, answersStep])
  .then(assembleStep)
  .then(checksStep)
  .commit();
