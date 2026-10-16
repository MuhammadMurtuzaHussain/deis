import type { z } from "zod";
import { RequestContext } from "@mastra/core/request-context";
import type { AgentName } from "./agents";
import { answering, BUDGET, type Answer, type ModelChain } from "./model";
import { isNoNetwork, isOfflineError, OfflineError } from "@/lib/server/net";
import { modelErrorCode, reportFlags, reportModelError, traceAgent, traceChat, type Task } from "@/lib/server/telemetry";

// Every Gemma call in Deis goes through here. Native JSON-schema mode first; if a
// model ignores it (small local models sometimes do) or the host doesn't support it,
// one retry with the schema written into the prompt, then pull JSON out of the text.
// Only a JSON or schema failure, or a reply the host broke off halfway, gets that retry:
// a timeout or a dead host would just fail again, slower. Cloud calls have a total time budget; on a laptop, calls run one
// at a time. Each call is a Sentry agent span with a chat span per attempt.

/** model and host: who actually answered, which differs from the first in the chain after a failover. */
export type Usage = { inputTokens: number; outputTokens: number; ms: number; model?: string; host?: string };

class NoJson extends Error {}
/** The host stopped mid-reply (finish reason "error"): half a CV, not a model that can't do JSON. Worth one retry. */
class StreamBroke extends Error {}

/** A reply that wasn't the JSON asked for, or a host refusing the schema in JSON mode. Never a timeout or a network error. */
function isJsonFailure(e: unknown): boolean {
  if (e instanceof NoJson) return true;
  let text = "";
  for (let x = e, i = 0; x && typeof x === "object" && i < 6; x = (x as { cause?: unknown }).cause, i++) text += ` ${(x as Error).name} ${(x as Error).message}`;
  if (/timed? ?out|timeout|abort|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|socket|DEIS_OFFLINE/i.test(text)) return false;
  return /JSON|schema|structured output|validation|no object generated|invalid argument/i.test(text);
}

// On a laptop, parallel calls fight over one GPU and all finish late, so the local tier
// runs one at a time. Kept on globalThis so every route in this process shares the queue.
const QUEUE = Symbol.for("deis.localQueue");
function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  const g = globalThis as unknown as Record<symbol, Promise<unknown>>;
  const run = (g[QUEUE] ?? Promise.resolve()).then(fn, fn);
  g[QUEUE] = run.catch(() => undefined);
  return run;
}

/** The first {...} or [...] block in a reply, for models that wrap JSON in prose or fences. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.search(/[[{]/);
  if (start < 0) return null;
  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) {
      try {
        return JSON.parse(candidate.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function structured<T>(
  task: Task,
  name: AgentName,
  chain: ModelChain,
  prompt: string,
  schema: z.ZodType<T>,
  opts: { maxOutputTokens: number; temperature?: number },
): Promise<{ data: T; usage: Usage }> {
  const call = () => structuredNow(task, name, chain, prompt, schema, opts);
  return chain.tier === "local" ? oneAtATime(call) : call();
}

async function structuredNow<T>(
  task: Task,
  name: AgentName,
  chain: ModelChain,
  prompt: string,
  schema: z.ZodType<T>,
  opts: { maxOutputTokens: number; temperature?: number },
): Promise<{ data: T; usage: Usage }> {
  const where = { tier: chain.tier, model: String(chain.models[0]?.id ?? "unknown") };
  const temperature = opts.temperature ?? 0.2;
  const requestContext = new RequestContext([["chain", chain]]);
  // Through the Mastra instance, so every agent call is traced (imported here, not at the top: index imports this file).
  const { mastra } = await import("./index");
  const agent = mastra.getAgent(name);
  const started = Date.now();
  const local = chain.tier === "local";
  const budget = local ? Infinity : BUDGET[chain.effort ?? "careful"].totalMs;
  const left = () => budget - (Date.now() - started);
  const answer: Answer = {};

  const attempt = async (inject: boolean, n: number) => {
    const timeout = Number.isFinite(budget) ? { totalMs: Math.max(1000, left()) } : undefined;
    const res = await answering.run(answer, () =>
      traceChat(
        where,
        { temperature, maxOutputTokens: opts.maxOutputTokens, attempt: n },
        () =>
          agent.generate(prompt, {
            requestContext,
            // Mastra's default error processors retry a failed step up to twice more, 3 s apart, on top
            // of each entry's maxRetries. The chain's own retries and fallbacks are the only ones wanted.
            errorProcessors: [],
            structuredOutput: { schema, jsonPromptInjection: inject },
            modelSettings: { temperature, maxOutputTokens: opts.maxOutputTokens, ...(timeout ? { timeout } : {}) },
          }),
        () => answer,
      ),
    );
    const usage: Usage = {
      inputTokens: res.totalUsage?.inputTokens ?? res.usage?.inputTokens ?? 0,
      outputTokens: res.totalUsage?.outputTokens ?? res.usage?.outputTokens ?? 0,
      ms: Date.now() - started,
      model: res.response?.modelId,
      host: answer.host,
    };
    if (res.object) return { data: res.object as T, usage };
    const parsed = schema.safeParse(extractJson(res.text ?? ""));
    if (parsed.success) return { data: parsed.data, usage };
    if (res.finishReason === "error") throw new StreamBroke("The host stopped before the reply finished");
    // Local debugging only (DEIS_DEBUG=1): what the model actually said. Never sent anywhere.
    if (process.env.DEIS_DEBUG) console.error(`[${task}] attempt ${n} raw:`, (res.text ?? "").slice(0, 800), "| issues:", JSON.stringify(parsed.error?.issues?.slice(0, 3)));
    throw new NoJson("Model returned no usable JSON");
  };

  const fail = (e: unknown): never => {
    // A schema error's message can quote the model's output, so only the host's errors are logged as text.
    if (e instanceof StreamBroke) {
      reportModelError(task, where, "stream_error");
      console.error(`[${task}] stream_error from`, where.model);
    } else if (isJsonFailure(e)) {
      reportFlags(task, ["json_failed"], where);
      console.error(`[${task}] no usable JSON from`, where.model);
    } else {
      reportModelError(task, where, modelErrorCode(e));
      console.error(`[${task}]`, modelErrorCode(e), (e instanceof Error ? e.message : String(e)).slice(0, 200));
    }
    // No route to the internet on a cloud tier: say so, so the app can wait for the connection.
    if (!local && isNoNetwork(e)) throw new OfflineError(isOfflineError(e) ? undefined : "Deis couldn't reach the internet, so Gemma couldn't answer.", { cause: e });
    throw e;
  };

  return traceAgent(agent.name, task, where, async () => {
    // Local models follow a schema in the prompt more reliably than Ollama's format mode, and
    // AI Studio's Gemma refuses bigger schemas in JSON mode ("invalid argument" at 16 fit requirements),
    // so on the demo and on AI Studio the schema stays in the prompt for the second try too.
    const aiStudioGemma = /^(demo|google):gemma/.test(String(chain.models[0]?.id));
    const promptOnly = chain.tier === "demo" || aiStudioGemma;
    const injectFirst = local || promptOnly;
    try {
      return await attempt(injectFirst, 1);
    } catch (first) {
      if (!(isJsonFailure(first) || first instanceof StreamBroke) || left() < 15_000) return fail(first);
      try {
        const second = await attempt(promptOnly || !injectFirst, 2);
        reportFlags(task, ["json_retry"], where);
        return second;
      } catch (e) {
        return fail(e);
      }
    }
  });
}
