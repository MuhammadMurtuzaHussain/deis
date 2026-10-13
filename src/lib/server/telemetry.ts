import * as Sentry from "@sentry/nextjs";
import type { Tier } from "../ai/settings";
import type { GuardEvent } from "../cv/guard";

// Sentry agent tracing, set up in sentry.server.config.ts.
//
// Traces: each request is a workflow span, each Mastra step a child, each Gemma call a
// gen_ai.invoke_agent span with a gen_ai.chat span per attempt (model, tier, tokens).
//
// Issues: Gemma suggests, the guard decides. Every time the guard steps in it's a
// Sentry issue tagged with the rule, tier and model, so "how often does the 4B model
// on a laptop need correcting, compared with the 26B in the cloud?" has an answer.
//
// Never sent: CVs, facts, postings, prompts, outputs, keys. Only rule names and counts.

const LABEL: Record<string, string> = {
  uncited: "A CV line cited no fact",
  unknown_fact: "A CV line cited a fact that doesn't exist",
  unsupported_number: "A number wasn't in the cited facts",
  unsupported_tool: "A tool wasn't in the cited facts",
  unsupported_cert: "A certification wasn't in the cited facts",
  years_claim: "Gemma stated a total years of experience",
  never_claim: "Gemma wrote something on the never-claim list",
  wrong_employer: "A bullet was filed under the wrong employer",
  first_person: "A CV line was in the first person",
  unsupported_skill: "A skill wasn't in the profile",
  fit_demoted: "A 'strong' match had no facts, so it became a gap",
  model_error: "Gemma call failed",
  json_retry: "Gemma needed a second try to return valid JSON",
  json_failed: "Gemma never returned valid JSON",
  injection_found: "A job posting tried to instruct AI tools",
};

export const sentryEnabled = () => Boolean(Sentry.getClient()?.getDsn());

export type Task = "import" | "card" | "fit" | "cv" | "letter" | "answers" | "questions" | "proposals" | "feed";
export type Where = { tier: Tier; model: string };

export function reportFlags(task: Task, flags: string[], where: Where) {
  if (!flags.length || !sentryEnabled()) return;
  for (const rule of new Set(flags)) {
    Sentry.withScope((scope) => {
      scope.setLevel(rule === "model_error" || rule === "json_failed" ? "error" : "warning");
      scope.setTags({ task, tier: where.tier, model: where.model, rule });
      scope.setFingerprint(["guard", task, rule]);
      scope.setExtra("count", flags.filter((f) => f === rule).length);
      Sentry.captureMessage(`Guard: ${LABEL[rule] ?? rule}`);
    });
  }
  Sentry.getActiveSpan()?.setAttribute("guard.flags", [...new Set(flags)].join(","));
}

export const reportGuard = (task: Task, events: GuardEvent[], where: Where) =>
  reportFlags(
    task,
    events.map((e) => e.rule),
    where,
  );

export const traceStep = <T>(name: string, fn: () => Promise<T>) => Sentry.startSpan({ op: "workflow.step", name }, fn);
export const traceWorkflow = <T>(name: string, fn: () => Promise<T>) => Sentry.startSpan({ op: "workflow", name }, fn);

const SYSTEM: Record<Tier, string> = { demo: "gcp.gemini", cloud: "gcp.gemini", local: "ollama", custom: "openai_compatible" };

export function traceAgent<T>(agent: string, task: Task, where: Where, fn: () => Promise<T>): Promise<T> {
  return Sentry.startSpan(
    {
      op: "gen_ai.invoke_agent",
      name: `invoke_agent ${agent}`,
      attributes: {
        "gen_ai.operation.name": "invoke_agent",
        "gen_ai.agent.name": agent,
        "gen_ai.system": SYSTEM[where.tier],
        "gen_ai.request.model": where.model,
        "app.task": task,
        "app.tier": where.tier,
      },
    },
    fn,
  );
}

type Usage = { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined;

export async function traceChat<T extends { usage?: Usage; totalUsage?: Usage }>(
  where: Where,
  settings: { temperature: number; maxOutputTokens: number; attempt: number },
  fn: () => Promise<T>,
): Promise<T> {
  return Sentry.startSpan(
    {
      op: "gen_ai.chat",
      name: `chat ${where.model}`,
      attributes: {
        "gen_ai.operation.name": "chat",
        "gen_ai.system": SYSTEM[where.tier],
        "gen_ai.request.model": where.model,
        "gen_ai.request.temperature": settings.temperature,
        "gen_ai.request.max_tokens": settings.maxOutputTokens,
        "app.attempt": settings.attempt,
      },
    },
    async (span) => {
      const res = await fn();
      const u = res.totalUsage ?? res.usage;
      if (u?.inputTokens != null) span.setAttribute("gen_ai.usage.input_tokens", u.inputTokens);
      if (u?.outputTokens != null) span.setAttribute("gen_ai.usage.output_tokens", u.outputTokens);
      if (u?.totalTokens != null) span.setAttribute("gen_ai.usage.total_tokens", u.totalTokens);
      return res;
    },
  );
}
