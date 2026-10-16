import { z } from "zod";

// Where the user's Gemma runs. Chosen in the app, stored on the user's device, and
// sent with each AI request in one header. On the desktop app the server is the
// user's own machine; on the hosted demo it's Render, which never stores it.

export const DEFAULTS = {
  google: "gemma-4-26b-a4b-it",
  ollama: "gemma4:e4b",
  /** "Better writing": the bigger local model writes the kit (about 2 minutes on a 16 GB laptop). */
  kitModel: "gemma4:12b",
  ollamaUrl: "http://127.0.0.1:11434/api",
} as const;

export const aiSettingsSchema = z.discriminatedUnion("provider", [
  /** The hosted demo's own key. Web demo only, rate limited. */
  z.object({ provider: z.literal("demo") }),
  /** The user's free Google AI Studio key, serving open-weight Gemma. */
  z.object({ provider: z.literal("google"), apiKey: z.string().min(10).max(200), model: z.string().max(80).default(DEFAULTS.google) }),
  /** Gemma on the user's own machine through Ollama. Nothing leaves it. kitModel, when set, writes the kit. */
  z.object({
    provider: z.literal("ollama"),
    baseUrl: z.string().url().default(DEFAULTS.ollamaUrl),
    model: z.string().max(80).default(DEFAULTS.ollama),
    kitModel: z.string().max(80).optional(),
  }),
  /** Any OpenAI-compatible server: LM Studio, llama.cpp, vLLM, OpenRouter. */
  z.object({
    provider: z.literal("openai"),
    baseUrl: z.string().url(),
    apiKey: z.string().max(400).optional(),
    model: z.string().min(1).max(120),
  }),
]);
export type AiSettings = z.infer<typeof aiSettingsSchema>;

export type Tier = "demo" | "cloud" | "local" | "custom";

export function tierOf(s: AiSettings): Tier {
  switch (s.provider) {
    case "demo":
      return "demo";
    case "google":
      return "cloud";
    case "ollama":
      return "local";
    case "openai":
      return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(s.baseUrl) ? "local" : "custom";
  }
}

export const AI_HEADER = "x-deis-ai";

/** Header value: base64url JSON, so keys survive proxies that mangle odd characters. */
export function encodeSettings(s: AiSettings): string {
  const json = JSON.stringify(s);
  const b64 = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeSettings(v: string | null): AiSettings | null {
  if (!v) return null;
  try {
    const b64 = v.replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof atob === "function" ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, "base64").toString("utf8");
    const parsed = aiSettingsSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
