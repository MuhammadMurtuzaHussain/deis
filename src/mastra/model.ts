import { AsyncLocalStorage } from "node:async_hooks";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOllama } from "ollama-ai-provider-v2";
import type { ModelWithRetries } from "@mastra/core/agent";
import { DEFAULTS, tierOf, type AiSettings, type Tier } from "@/lib/ai/settings";
import { guardedFetch, isLoopback, isOfflineError, isOfflineMode, netFetch } from "@/lib/server/net";

// One switch decides where Gemma runs, per request:
//   ollama  → the user's own laptop; nothing leaves it
//   google  → the user's free Google AI Studio key
//   openai  → any OpenAI-compatible server the user runs or rents
//   demo    → the hosted demo's key, then up to two fallback hosts (AI Studio's Gemma 4 has bouts of 500s)
// Each entry is a Mastra fallback: if one host fails, the next one answers.

/** light: cards and checks. careful: fit, import. writing: the kit, which may use a bigger local model. */
export type Effort = "light" | "careful" | "writing";

export type ModelChain = { tier: Tier; label: string; models: ModelWithRetries[]; effort?: Effort };

/**
 * Cloud time budgets: stepMs for one host's answer (then the next host is asked), totalMs
 * for the whole call including a JSON retry. Local calls have none: a laptop takes its time,
 * and the kit route's maxDuration is the limit.
 */
export const BUDGET: Record<Effort, { stepMs: number; totalMs: number }> = {
  light: { stepMs: 40_000, totalMs: 80_000 },
  careful: { stepMs: 100_000, totalMs: 180_000 },
  writing: { stepMs: 100_000, totalMs: 180_000 },
};

/** One context size for every local call: when it changes between calls, Ollama reloads the model (2.4 to 4 s each time). */
export const NUM_CTX = 16384;
const KEEP_ALIVE = "15m";

/** On the hosted demo, the server must not fetch arbitrary URLs for strangers (SSRF). */
const HOSTED_OPENAI_HOSTS = ["openrouter.ai", "api.groq.com", "api.together.xyz", "api.deepinfra.com", "api.fireworks.ai", "api.mistral.ai"];

export const OFFLINE_MESSAGE = "Offline mode is on. Choose Gemma on this computer in Settings.";

export class SettingsRejected extends Error {
  /** "DEIS_OFFLINE" when offline mode is why. */
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

const isHosted = () => process.env.DEIS_HOSTED === "1";

// ---- Which host answered, for the trace and /api/check. structured() opens a store per
// call; the providers' fetch writes into it when a host returns a good response.

export type Answer = { host?: string; system?: string };
export const answering = new AsyncLocalStorage<Answer>();

// ---- Passive health: a host that fails goes to the back of the demo's queue for 2 minutes.

const DOWN_MS = 120_000;
const AISTUDIO = "aistudio";
const downUntil = new Map<string, number>();
const healthy = (key: string) => (downUntil.get(key) ?? 0) <= Date.now();
const markDown = (key: string) => downUntil.set(key, Date.now() + DOWN_MS);

/** A provider's fetch: through the egress door, noting who answered and which demo host failed. */
function via(host: string, system: string, base: typeof fetch, health?: string): typeof fetch {
  return async (input, init) => {
    try {
      const res = await base(input, init);
      // 401/403 too: a missing or revoked key won't answer the next person either.
      if (health && (res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500)) markDown(health);
      const store = answering.getStore();
      if (res.ok && store) Object.assign(store, { host, system });
      return res;
    } catch (e) {
      if (health && !isOfflineError(e)) markDown(health);
      throw e;
    }
  };
}

// Node's fetch stops waiting for a response after 300 s (undici's headersTimeout), and a 12B
// kit on a laptop can take longer. Node doesn't export its undici Agent, but its global
// dispatcher is one, so local calls get a patient Agent of the same class.
type Dispatcher = object;
let patient: Dispatcher | undefined;
async function patientDispatcher(): Promise<Dispatcher | undefined> {
  if (patient) return patient;
  const key = Symbol.for("undici.globalDispatcher.1");
  const g = globalThis as unknown as Record<symbol, { constructor: new (o: object) => Dispatcher } | undefined>;
  // An already-aborted fetch makes Node create its global dispatcher without opening a socket.
  if (!g[key]) await fetch("http://127.0.0.1/", { signal: AbortSignal.abort() }).catch(() => undefined);
  const Agent = g[key]?.constructor;
  patient = Agent ? new Agent({ headersTimeout: 0, bodyTimeout: 0 }) : undefined;
  return patient;
}

/** Loopback model servers: no deadline at all. */
export const localFetch: typeof fetch = async (input, init) => {
  const dispatcher = await patientDispatcher();
  return netFetch("model", input instanceof Request ? input : String(input), { ...init, dispatcher } as RequestInit);
};

/** Ollama: keep the model loaded between calls, so a kit after a card doesn't wait for a reload. */
const keepLoaded =
  (base: typeof fetch): typeof fetch =>
  (input, init) => {
    const body = typeof init?.body === "string" && init.body.startsWith("{") ? JSON.stringify({ ...JSON.parse(init.body), keep_alive: KEEP_ALIVE }) : init?.body;
    return base(input, { ...init, body });
  };

/**
 * AI Studio's Gemma 4 takes only "minimal" or "high": "low" and "medium" are a 400 every time.
 * "high" thinks past the deadline on a CV, so Gemma stays on "minimal"; Gemini gets "low" when careful.
 */
const thinkingLevel = (model: string, effort: Effort) => (effort !== "light" && !/^gemma/i.test(model) ? ("low" as const) : ("minimal" as const));

function googleEntries(apiKey: string, primary: string, effort: Effort, id: string, o: { retries?: number; health?: string; dropBig?: boolean } = {}): ModelWithRetries[] {
  const retries = o.retries ?? 2;
  const google = createGoogleGenerativeAI({ apiKey, fetch: via("Google AI Studio", "gcp.gemini", guardedFetch("model"), o.health) });
  // 31B failed more often than 26B on 13 Oct; with another host to ask, it isn't worth the wait.
  const alternates = primary.startsWith("gemma-4") ? ["gemma-4-26b-a4b-it", "gemma-4-31b-it"].filter((m) => m !== primary && !(o.dropBig && m === "gemma-4-31b-it")) : [];
  return [primary, ...alternates].map((m, i) => ({
    id: `${id}:${m}`,
    model: google(m),
    maxRetries: i === 0 ? retries : Math.min(retries, 1),
    modelSettings: { timeout: { stepMs: BUDGET[effort].stepMs } },
    providerOptions: { google: { thinkingConfig: { thinkingLevel: thinkingLevel(m, effort) } } },
  }));
}

const ollamaUrl = () => (process.env.OLLAMA_BASE_URL || DEFAULTS.ollamaUrl).replace(/\/$/, "");

function ollamaEntry(baseUrl: string, model: string): ModelWithRetries {
  const ollama = createOllama({ baseURL: baseUrl, fetch: via("Ollama", "ollama", keepLoaded(isLoopback(baseUrl) ? localFetch : guardedFetch("model"))) });
  // Gemma thinks at length by default; a fit check doesn't need it.
  return { id: `ollama:${model}`, model: ollama(model), maxRetries: 1, providerOptions: { ollama: { think: false, options: { num_ctx: NUM_CTX } } } };
}

/** Models that think before answering. Asked for a JSON schema, Gemma 4 on Ollama thinks until it runs out of tokens and answers nothing. */
const THINKS = /gemma-?4|qwen3|deepseek-r1|gpt-oss|magistral/i;

function openaiEntry(baseUrl: string, apiKey: string | undefined, model: string, effort: Effort, o: { retries?: number; health?: string; reasoning?: boolean } = {}): ModelWithRetries {
  const host = new URL(baseUrl).host;
  // Servers on this machine can take their time; rented ones get the cloud budget.
  const local = isLoopback(baseUrl);
  const provider = createOpenAICompatible({ name: "custom", baseURL: baseUrl, apiKey, supportsStructuredOutputs: true, fetch: via(host, "openai", local ? localFetch : guardedFetch("model"), o.health) });
  return {
    id: `openai:${host}:${model}`,
    model: provider.chatModel(model),
    maxRetries: o.retries ?? 1,
    modelSettings: local ? undefined : { timeout: { stepMs: BUDGET[effort].stepMs } },
    providerOptions: o.reasoning !== false && THINKS.test(model) ? { custom: { reasoningEffort: "none" } } : undefined,
  };
}

// ---- The demo's hosts, from env: AI Studio, then FALLBACK_*, then FALLBACK_2_*.

type Fallback = { key: string; baseUrl: string; apiKey?: string; model: string; reasoning: boolean };

function fallbacks(): Fallback[] {
  return ["FALLBACK", "FALLBACK_2"].flatMap((p) => {
    const baseUrl = process.env[`${p}_BASE_URL`];
    const model = process.env[`${p}_MODEL`];
    if (!baseUrl || !model || !URL.canParse(baseUrl)) return [];
    const apiKey = process.env[`${p}_API_KEY`];
    // The blueprint sets the URL and model; a rented host without its key only answers 401.
    if (!apiKey && !isLoopback(baseUrl)) return [];
    // A host that answers 400 to reasoning_effort gets FALLBACK_REASONING=omit.
    return [{ key: p, baseUrl, apiKey, model, reasoning: process.env[`${p}_REASONING`] !== "omit" }];
  });
}

const hasDemoHosts = () => Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY) || fallbacks().length > 0;

/** For /api/status: which hosts the demo would ask, and which are resting after a failure. No keys, no URLs. */
/** A name a person recognises, not "127.0.0.1:11434", for the hosts the demo asks. */
const HOST_NAMES: Record<string, string> = { "openrouter.ai": "OpenRouter", "api.groq.com": "Groq", "api.together.xyz": "Together AI", "api.deepinfra.com": "DeepInfra", "api.fireworks.ai": "Fireworks", "api.mistral.ai": "Mistral" };
function hostLabel(baseUrl: string): string {
  const { hostname, host } = new URL(baseUrl);
  if (/^(localhost|127\.|\[?::1\]?$)/.test(hostname)) return "Gemma on this computer";
  return HOST_NAMES[hostname] ?? host;
}

export function demoHosts(): { label: string; model: string; healthy: boolean }[] {
  const out = process.env.GOOGLE_GENERATIVE_AI_API_KEY ? [{ label: "Google AI Studio", model: process.env.GOOGLE_MODEL || DEFAULTS.google, healthy: healthy(AISTUDIO) }] : [];
  return [...out, ...fallbacks().map((f) => ({ label: hostLabel(f.baseUrl), model: f.model, healthy: healthy(f.key) }))];
}

// AI Studio's Gemma 4 has bad days (500s, some taking 50 s). A tiny probe, at most every two
// minutes, sends it to the back of the queue while it's failing.
let lastProbe = 0;
function probeGoogle(apiKey: string, model: string) {
  if (Date.now() - lastProbe < DOWN_MS || isOfflineMode()) return;
  lastProbe = Date.now();
  netFetch("model-probe", `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: "Reply ok" }] }], generationConfig: { maxOutputTokens: 5, thinkingConfig: { thinkingLevel: "minimal" } } }),
    signal: AbortSignal.timeout(20_000),
  })
    .then((r) => {
      if (r.ok) return;
      markDown(AISTUDIO);
      console.warn("[model] AI Studio", model, r.status, "so the demo asks its other hosts first");
    })
    .catch(() => markDown(AISTUDIO));
}

function demoChain(effort: Effort): ModelChain {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const extra = fallbacks();
  const hosts: { health: string; entries: ModelWithRetries[] }[] = [];
  // No retries anywhere on the demo: the next host is the retry, and the time budget stays honest.
  if (key) {
    hosts.push({ health: AISTUDIO, entries: googleEntries(key, process.env.GOOGLE_MODEL || DEFAULTS.google, effort, "demo", { retries: 0, health: AISTUDIO, dropBig: extra.length > 0 }) });
    probeGoogle(key, process.env.GOOGLE_MODEL || DEFAULTS.google);
  }
  for (const f of extra) hosts.push({ health: f.key, entries: [openaiEntry(f.baseUrl, f.apiKey, f.model, effort, { retries: 0, health: f.key, reasoning: f.reasoning })] });
  if (!hosts.length) return localChain(process.env.OLLAMA_MODEL || DEFAULTS.ollama, effort);
  const ordered = [...hosts.filter((h) => healthy(h.health)), ...hosts.filter((h) => !healthy(h.health))];
  return { tier: "demo", label: "Gemma 4 on the Deis demo server", models: ordered.flatMap((h) => h.entries), effort };
}

// ---- Gemma on this computer

type LocalModel = { name: string; size: number };
let installed: { at: number; models: LocalModel[] | null } | null = null;

/** What Ollama on this computer has installed, or null when it isn't running. */
export async function localModels(): Promise<LocalModel[] | null> {
  try {
    const r = await netFetch("ollama", `${ollamaUrl()}/tags`, { signal: AbortSignal.timeout(2000) });
    installed = { at: Date.now(), models: ((await r.json()) as { models?: LocalModel[] }).models ?? [] };
  } catch {
    installed = { at: Date.now(), models: null };
  }
  return installed.models;
}

/** The Gemma to use on this computer: a name, false when Ollama has none, null when we don't know yet. */
function localGemma(): string | false | null {
  if (!installed || Date.now() - installed.at > 60_000) void localModels();
  const names = installed?.models?.map((m) => m.name);
  if (!names) return null;
  return names.includes(DEFAULTS.ollama) ? DEFAULTS.ollama : (names.find((n) => /gemma/i.test(n)) ?? false);
}

const localChain = (model: string, effort: Effort): ModelChain => ({ tier: "local", label: `Gemma (${model}) on this computer`, models: [ollamaEntry(ollamaUrl(), model)], effort });

function ollamaChain(s: Extract<AiSettings, { provider: "ollama" }>, effort: Effort): ModelChain {
  // "Better writing": the kit goes to the bigger model, and to the usual one if that isn't installed.
  const kit = effort === "writing" && s.kitModel && s.kitModel !== s.model ? s.kitModel : null;
  const models = kit ? [ollamaEntry(s.baseUrl, kit), ollamaEntry(s.baseUrl, s.model)] : [ollamaEntry(s.baseUrl, s.model)];
  return { tier: "local", label: `${kit ?? s.model} on this computer`, models, effort };
}

const runsHere = (s: AiSettings) => (s.provider === "ollama" || s.provider === "openai") && isLoopback(s.baseUrl);

export function modelChain(settings: AiSettings, effort: Effort = "light"): ModelChain {
  if (isHosted() && settings.provider === "ollama") throw new SettingsRejected("Ollama runs on your own computer. Download the Deis app to use it.");
  if (isHosted() && settings.provider === "openai" && !HOSTED_OPENAI_HOSTS.includes(new URL(settings.baseUrl).hostname)) {
    throw new SettingsRejected("The web demo only connects to well-known AI hosts. The Deis app connects to any server.");
  }
  const offline = isOfflineMode();
  if (!isHosted() && settings.provider === "demo" && (offline || !hasDemoHosts())) {
    // The desktop app has no demo key, and offline the demo's hosts are out of reach: Gemma on
    // this computer stands in, unless Ollama answered and has no Gemma at all.
    const gemma = localGemma();
    if (offline && gemma === false) throw new SettingsRejected(OFFLINE_MESSAGE, "DEIS_OFFLINE");
    return localChain(gemma || DEFAULTS.ollama, effort);
  }
  if (offline && !runsHere(settings)) throw new SettingsRejected(OFFLINE_MESSAGE, "DEIS_OFFLINE");
  switch (settings.provider) {
    case "demo":
      return demoChain(effort);
    case "google":
      return { tier: tierOf(settings), label: `${settings.model} on your Google AI Studio key`, models: googleEntries(settings.apiKey, settings.model, effort, "google"), effort };
    case "ollama":
      return ollamaChain(settings, effort);
    case "openai":
      return { tier: tierOf(settings), label: `${settings.model} at ${new URL(settings.baseUrl).host}`, models: [openaiEntry(settings.baseUrl, settings.apiKey, settings.model, effort)], effort };
  }
}
