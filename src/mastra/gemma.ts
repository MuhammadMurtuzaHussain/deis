import type { z } from "zod";
import { RequestContext } from "@mastra/core/request-context";
import { agents, type AgentName } from "./agents";
import type { ModelChain } from "./model";
import { reportFlags, traceAgent, traceChat, type Task } from "@/lib/server/telemetry";

// Every Gemma call in Deis goes through here. Native JSON-schema mode first; if a
// model ignores it (small local models sometimes do) or the host doesn't support it,
// one retry with the schema written into the prompt, then pull JSON out of the text.
// Each call is a Sentry agent span with a chat span per attempt.

export type Usage = { inputTokens: number; outputTokens: number; ms: number };

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

export async function structured<T>(
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
  const agent = agents[name];
  const started = Date.now();

  const attempt = async (inject: boolean, n: number) => {
    const res = await traceChat(where, { temperature, maxOutputTokens: opts.maxOutputTokens, attempt: n }, () =>
      agent.generate(prompt, {
        requestContext,
        structuredOutput: { schema, jsonPromptInjection: inject },
        modelSettings: { temperature, maxOutputTokens: opts.maxOutputTokens },
      }),
    );
    const usage: Usage = {
      inputTokens: res.totalUsage?.inputTokens ?? res.usage?.inputTokens ?? 0,
      outputTokens: res.totalUsage?.outputTokens ?? res.usage?.outputTokens ?? 0,
      ms: Date.now() - started,
    };
    if (res.object) return { data: res.object as T, usage };
    const parsed = schema.safeParse(extractJson(res.text ?? ""));
    if (parsed.success) return { data: parsed.data, usage };
    // Local debugging only (DEIS_DEBUG=1): what the model actually said. Never sent anywhere.
    if (process.env.DEIS_DEBUG) console.error(`[${task}] attempt ${n} raw:`, (res.text ?? "").slice(0, 800), "| issues:", JSON.stringify(parsed.error?.issues?.slice(0, 3)));
    throw new Error("Model returned no usable JSON");
  };

  return traceAgent(agent.name, task, where, async () => {
    // Local models follow a schema in the prompt more reliably than Ollama's format mode, and
    // AI Studio's Gemma refuses bigger schemas in JSON mode ("invalid argument" at 16 fit requirements),
    // so its second try stays in the prompt too: JSON mode would only refuse again.
    const aiStudioGemma = /^(demo|google):gemma/.test(String(chain.models[0]?.id));
    const injectFirst = chain.tier === "local" || aiStudioGemma;
    try {
      return await attempt(injectFirst, 1);
    } catch (first) {
      try {
        const second = await attempt(aiStudioGemma || !injectFirst, 2);
        reportFlags(task, ["json_retry"], where);
        return second;
      } catch (e) {
        reportFlags(task, ["json_failed"], where);
        console.error(`[${task}]`, first instanceof Error ? first.message : first, "|", e instanceof Error ? e.message : e);
        throw e;
      }
    }
  });
}
