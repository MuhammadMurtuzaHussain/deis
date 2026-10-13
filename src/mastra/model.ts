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

function googleEntries(apiKey: string, primary: string, effort: Effort, id: string): ModelWithRetries[] {
  const google = createGoogleGenerativeAI({ apiKey });
  const providerOptions = { google: { thinkingConfig: { thinkingLevel: effort === "careful" ? ("low" as const) : ("minimal" as const) } } };
  const ids = [primary, ...(primary.startsWith("gemma-4") ? ["gemma-4-26b-a4b-it", "gemma-4-31b-it"].filter((m) => m !== primary) : [])];
  return ids.map((m, i) => ({ id: `${id}:${m}`, model: google(m), maxRetries: i === 0 ? 2 : 1, providerOptions }));
}

function ollamaEntry(baseUrl: string, model: string, effort: Effort): ModelWithRetries {
  const ollama = createOllama({ baseURL: baseUrl });
  // Gemma thinks at length by default; a fit check doesn't need it. The bigger context fits a CV plus a posting.
  return { id: `ollama:${model}`, model: ollama(model), maxRetries: 1, providerOptions: { ollama: { think: false, options: { num_ctx: effort === "careful" ? 16384 : 8192 } } } };
}

function openaiEntry(baseUrl: string, apiKey: string | undefined, model: string): ModelWithRetries {
  const provider = createOpenAICompatible({ name: "custom", baseURL: baseUrl, apiKey, supportsStructuredOutputs: true });
  return { id: `openai:${model}`, model: provider.chatModel(model), maxRetries: 1 };
}

function demoChain(effort: Effort): ModelChain {
  const models: ModelWithRetries[] = [];
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) models.push(...googleEntries(process.env.GOOGLE_GENERATIVE_AI_API_KEY, process.env.GOOGLE_MODEL ?? DEFAULTS.google, effort, "demo"));
  // A second Gemma host for when AI Studio is having a bad day (DigitalOcean serverless inference, OpenRouter …).
  if (process.env.FALLBACK_BASE_URL && process.env.FALLBACK_MODEL) models.push(openaiEntry(process.env.FALLBACK_BASE_URL, process.env.FALLBACK_API_KEY, process.env.FALLBACK_MODEL));
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
      return { tier: tierOf(settings), label: `${settings.model} at ${new URL(settings.baseUrl).host}`, models: [openaiEntry(settings.baseUrl, settings.apiKey, settings.model)] };
  }
}
