import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOllama } from "ollama-ai-provider-v2";
import type { ModelWithRetries } from "@mastra/core/agent";
import { DEFAULTS, tierOf, type AiSettings, type Tier } from "@/lib/ai/settings";

// One switch decides where Gemma runs, per request:
//   ollama  → the user's own laptop; nothing leaves it
//   google  → the user's free Google AI Studio key
//   openai  → any OpenAI-compatible server the user runs or rents
//   demo    → the hosted demo's key, with fallbacks (AI Studio's Gemma 4 has bouts of 500s)
// Each entry is a Mastra fallback: if one host fails, the next one answers.

export type Effort = "light" | "careful";

export type ModelChain = { tier: Tier; label: string; models: ModelWithRetries[] };

/** On the hosted demo, the server must not fetch arbitrary URLs for strangers (SSRF). */
const HOSTED_OPENAI_HOSTS = ["openrouter.ai", "inference.do-ai.run", "api.groq.com", "api.together.xyz", "api.deepinfra.com", "api.fireworks.ai", "api.mistral.ai"];

export class SettingsRejected extends Error {}

const isHosted = () => process.env.DEIS_HOSTED === "1";

/** Cloud calls get a deadline: on a bad day AI Studio's Gemma either fails in half a second or hangs past 90 s. */
const withDeadline =
  (ms: number): typeof fetch =>
  (input, init) =>
    fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms) });

const deadline = (effort: Effort) => (effort === "careful" ? 120_000 : 45_000);

function googleEntries(apiKey: string, primary: string, effort: Effort, id: string, retries = 2): ModelWithRetries[] {
  const google = createGoogleGenerativeAI({ apiKey, fetch: withDeadline(deadline(effort)) });
  const providerOptions = { google: { thinkingConfig: { thinkingLevel: effort === "careful" ? ("low" as const) : ("minimal" as const) } } };
  const ids = [primary, ...(primary.startsWith("gemma-4") ? ["gemma-4-26b-a4b-it", "gemma-4-31b-it"].filter((m) => m !== primary) : [])];
  return ids.map((m, i) => ({ id: `${id}:${m}`, model: google(m), maxRetries: i === 0 ? retries : Math.min(retries, 1), providerOptions }));
}

function ollamaEntry(baseUrl: string, model: string, effort: Effort): ModelWithRetries {
  const ollama = createOllama({ baseURL: baseUrl });
  // Gemma thinks at length by default; a fit check doesn't need it. The bigger context fits a CV plus a posting.
  return { id: `ollama:${model}`, model: ollama(model), maxRetries: 1, providerOptions: { ollama: { think: false, options: { num_ctx: effort === "careful" ? 16384 : 8192 } } } };
}

/** Models that think before answering. Asked for a JSON schema, Gemma 4 on Ollama thinks until it runs out of tokens and answers nothing. */
const THINKS = /gemma-?4|qwen3|deepseek-r1|gpt-oss|magistral/i;

function openaiEntry(baseUrl: string, apiKey: string | undefined, model: string, effort: Effort = "light"): ModelWithRetries {
  // Servers on this machine can take their time; rented ones get the cloud deadline.
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(baseUrl);
  const provider = createOpenAICompatible({ name: "custom", baseURL: baseUrl, apiKey, supportsStructuredOutputs: true, fetch: local ? undefined : withDeadline(deadline(effort)) });
  return { id: `openai:${model}`, model: provider.chatModel(model), maxRetries: 1, providerOptions: THINKS.test(model) ? { custom: { reasoningEffort: "none" } } : undefined };
}

// AI Studio's Gemma 4 has bad days (500s, some taking 50 s). While it's failing, the demo
// asks the second host first. A tiny probe, at most every two minutes, decides.
let googleHealthy = true;
let lastProbe = 0;
function probeGoogle(apiKey: string, model: string) {
  if (Date.now() - lastProbe < 120_000) return;
  lastProbe = Date.now();
  fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: "Reply ok" }] }], generationConfig: { maxOutputTokens: 5 } }),
    signal: AbortSignal.timeout(8000),
  })
    .then((r) => {
      googleHealthy = r.ok;
      if (!r.ok) console.warn("[model] AI Studio", model, r.status, "so the demo asks its second host first");
    })
    .catch(() => {
      googleHealthy = false;
    });
}

function demoChain(effort: Effort): ModelChain {
  const google: ModelWithRetries[] = [];
  const second: ModelWithRetries[] = [];
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const googleModel = process.env.GOOGLE_MODEL ?? DEFAULTS.google;
  const hasSecond = Boolean(process.env.FALLBACK_BASE_URL && process.env.FALLBACK_MODEL);
  if (key) {
    // With a second host to fall back on, don't spend time retrying a failing one.
    google.push(...googleEntries(key, googleModel, effort, "demo", hasSecond ? 0 : 2));
    probeGoogle(key, googleModel);
  }
  // A second Gemma host for when AI Studio is having a bad day (DigitalOcean serverless inference, OpenRouter …).
  if (hasSecond) second.push(openaiEntry(process.env.FALLBACK_BASE_URL!, process.env.FALLBACK_API_KEY, process.env.FALLBACK_MODEL!, effort));
  const models = googleHealthy || !second.length ? [...google, ...second] : [...second, ...google];
  if (!models.length) models.push(ollamaEntry(process.env.OLLAMA_BASE_URL ?? DEFAULTS.ollamaUrl, process.env.OLLAMA_MODEL ?? DEFAULTS.ollama, effort));
  return { tier: "demo", label: "Gemma 4 on the Deis demo server", models };
}

export function modelChain(settings: AiSettings, effort: Effort = "light"): ModelChain {
  if (isHosted() && settings.provider === "ollama") throw new SettingsRejected("Ollama runs on your own computer. Download the Deis app to use it.");
  if (isHosted() && settings.provider === "openai" && !HOSTED_OPENAI_HOSTS.includes(new URL(settings.baseUrl).hostname)) {
    throw new SettingsRejected("The web demo only connects to well-known AI hosts. The Deis app connects to any server.");
  }
  if (!isHosted() && settings.provider === "demo" && !process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.FALLBACK_BASE_URL) {
    // The desktop app has no demo key; fall back to local Gemma.
    return { tier: "local", label: `Gemma (${DEFAULTS.ollama}) on this computer`, models: [ollamaEntry(DEFAULTS.ollamaUrl, DEFAULTS.ollama, effort)] };
  }
  switch (settings.provider) {
    case "demo":
      return demoChain(effort);
    case "google":
      return { tier: tierOf(settings), label: `${settings.model} on your Google AI Studio key`, models: googleEntries(settings.apiKey, settings.model, effort, "google") };
    case "ollama":
      return { tier: "local", label: `${settings.model} on this computer`, models: [ollamaEntry(settings.baseUrl, settings.model, effort)] };
    case "openai":
      return { tier: tierOf(settings), label: `${settings.model} at ${new URL(settings.baseUrl).host}`, models: [openaiEntry(settings.baseUrl, settings.apiKey, settings.model, effort)] };
  }
}
