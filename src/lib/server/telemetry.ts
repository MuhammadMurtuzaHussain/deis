import * as Sentry from "@sentry/nextjs";
import type { Tier } from "../ai/settings";
import type { GuardEvent } from "../cv/guard";
import { isNoNetwork, isOfflineError, isOfflineMode } from "./net";

// Sentry agent tracing, set up in sentry.server.config.ts.
//
// Traces: each request is a workflow span, each Mastra step a child, each Gemma call a
// gen_ai.invoke_agent span with a gen_ai.chat span per attempt (model, tier, tokens, and
// the model that actually answered, which differs from the first one when a host failed).
//
// Issues: Gemma suggests, the guard decides. Every time the guard steps in it's a
// Sentry issue tagged with the rule, tier and model, so "how often does the 4B model
// on a laptop need correcting, compared with the 26B in the cloud?" has an answer.
//
// Never sent: CVs, facts, postings, prompts, outputs, keys, error text. Only rule names,
// error codes and counts. Nothing at all while offline mode is on.

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
  past_as_present: "Something finished was written as ongoing",
  work_status: "Gemma wrote a visa or right-to-work claim",
  added_claim: "Gemma added a claim the cited facts don't make",
  posting_copy: "Gemma copied the posting's wording",
  cite_repaired: "A citation was repaired from the same employer's facts",
  model_error: "Gemma call failed",
  json_retry: "Gemma needed a second try to return valid JSON",
  json_failed: "Gemma never returned valid JSON",
  injection_found: "A job posting tried to instruct AI tools",
  board_failed: "A job board didn't answer",
};

export const sentryEnabled = () => !isOfflineMode() && Boolean(Sentry.getClient()?.getDsn());

export type Task = "import" | "card" | "fit" | "cv" | "letter" | "answers" | "questions" | "proposals" | "feed";
export type Where = { tier: Tier; model: string };

/** The issue title. Issues are grouped per task, so the task is in the title too, or one rule looks like duplicates. */
export const guardTitle = (task: Task, rule: string) => `Guard (${task}): ${LABEL[rule] ?? rule}`;

function report(task: Task, rule: string, tags: Record<string, string>, count = 1) {
  Sentry.withScope((scope) => {
    scope.setLevel(rule === "model_error" || rule === "json_failed" ? "error" : "warning");
    scope.setTags({ task, rule, ...tags });
    scope.setFingerprint(["guard", task, rule, ...(tags.code ? [tags.code] : [])]);
    scope.setExtra("count", count);
    Sentry.captureMessage(guardTitle(task, rule));
  });
}

export function reportFlags(task: Task, flags: string[], where: Where) {
  if (!flags.length || !sentryEnabled()) return;
  for (const rule of new Set(flags)) report(task, rule, { tier: where.tier, model: where.model }, flags.filter((f) => f === rule).length);
  Sentry.getActiveSpan()?.setAttribute("guard.flags", [...new Set(flags)].join(","));
}

export const reportGuard = (task: Task, events: GuardEvent[], where: Where) =>
  reportFlags(
    task,
    events.map((e) => e.rule),
    where,
  );

/** What kind of failure a model call was, as a short code. Never the message: it can carry model output. */
export function modelErrorCode(e: unknown): string {
  if (isOfflineError(e)) return "offline";
  if (isNoNetwork(e)) return "no_network";
  let text = "";
  let status: number | undefined;
  for (let x = e, i = 0; x && typeof x === "object" && i < 6; x = (x as { cause?: unknown }).cause, i++) {
    text += ` ${(x as Error).name} ${(x as Error).message}`;
    status ??= (x as { statusCode?: number }).statusCode;
  }
  if (/timed? ?out|timeout|abort/i.test(text)) return "timeout";
  if (status) return `http_${status}`;
  if (/ECONNREFUSED/.test(text)) return "refused";
  return "other";
}

export function reportModelError(task: Task, where: Where, code: string) {
  if (sentryEnabled()) report(task, "model_error", { tier: where.tier, model: where.model, code });
}

/** One issue per job board that failed a refresh, tagged with the board only. */
export function reportBoardFailures(boards: string[]) {
  if (sentryEnabled()) for (const board of boards) report("feed", "board_failed", { board });
}

export const traceStep = <T>(name: string, fn: () => Promise<T>) => Sentry.startSpan({ op: "workflow.step", name }, fn);
export const traceWorkflow = <T>(name: string, fn: () => Promise<T>) => Sentry.startSpan({ op: "workflow", name }, fn);

/** The provider, from a chain entry id (demo:gemma…, openai:host:model, ollama:model). */
export function systemOf(model: string): string {
  if (/^(demo|google):/.test(model)) return "gcp.gemini";
  if (model.startsWith("ollama:")) return "ollama";
  if (model.startsWith("openai:")) return "openai";
  return "unknown";
}

export function traceAgent<T>(agent: string, task: Task, where: Where, fn: () => Promise<T>): Promise<T> {
  return Sentry.startSpan(
    {
      op: "gen_ai.invoke_agent",
      name: `invoke_agent ${agent}`,
      attributes: {
        "gen_ai.operation.name": "invoke_agent",
        "gen_ai.agent.name": agent,
        "gen_ai.system": systemOf(where.model),
        "gen_ai.request.model": where.model,
        "app.task": task,
        "app.tier": where.tier,
      },
    },
    fn,
  );
}

type Usage = { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined;

export async function traceChat<T extends { usage?: Usage; totalUsage?: Usage; response?: { modelId?: string } }>(
  where: Where,
  settings: { temperature: number; maxOutputTokens: number; attempt: number },
  fn: () => Promise<T>,
  answered?: () => { host?: string; system?: string },
): Promise<T> {
  return Sentry.startSpan(
    {
      op: "gen_ai.chat",
      name: `chat ${where.model}`,
      attributes: {
        "gen_ai.operation.name": "chat",
        "gen_ai.system": systemOf(where.model),
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
      // After a failover the answer comes from a later host: name that one.
      if (res.response?.modelId) span.setAttribute("gen_ai.response.model", res.response.modelId);
      const who = answered?.();
      if (who?.system) span.setAttribute("gen_ai.system", who.system);
      if (who?.host) span.setAttribute("app.answered_by", who.host);
      return res;
    },
  );
}
