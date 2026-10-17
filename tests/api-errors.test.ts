import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiSettings } from "@/lib/ai/settings";
import { jobInputSchema } from "@/lib/server/api";

// modelFailure only reads the chain's tier and label; keep this test free of the real model chain.
vi.mock("@/mastra/model", () => ({ SettingsRejected: class extends Error {}, modelChain: () => ({}) }));
import { modelFailure, type Ai } from "@/lib/server/api";

const ai = (tier: Ai["chain"]["tier"], settings: AiSettings): Ai => ({ settings, chain: { tier, label: "test model", models: [] } });
const cloud = ai("cloud", { provider: "google", apiKey: "k".repeat(20), model: "gemma-4-26b-a4b-it" });
const demo = ai("demo", { provider: "demo" });
const ollama = ai("local", { provider: "ollama", baseUrl: "http://127.0.0.1:11434/api", model: "gemma4:e4b" });
const lmStudio = ai("local", { provider: "openai", baseUrl: "http://localhost:1234/v1", model: "gemma" });

/** An error with extra fields, the way fetch, the AI SDK and Mastra build them. */
const err = (message: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(message), extra);
// What the AI SDK throws when fetch can't connect: "Cannot connect to API" around undici's error.
const cannotConnect = (code: string, text: string) => err(`Cannot connect to API: ${text}`, { cause: err(text, { code }) });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const cases: [name: string, e: unknown, who: Ai, status: number, code: string, says?: RegExp][] = [
  ["offline mode, on any tier", err("All models failed", { cause: err("Refused in offline mode", { code: "DEIS_OFFLINE" }) }), cloud, 503, "offline", /offline mode/],
  ["offline mode on the demo", err("x", { lastError: err("refused", { code: "DEIS_OFFLINE" }) }), demo, 503, "offline"],
  ["no DNS on a cloud key", cannotConnect("ENOTFOUND", "getaddrinfo ENOTFOUND generativelanguage.googleapis.com"), cloud, 503, "network", /Gemma on this computer/],
  ["no network after retries", err("Failed after 3 attempts", { lastError: cannotConnect("ENETUNREACH", "connect ENETUNREACH 142.250.1.1:443") }), demo, 503, "network"],
  ["plain fetch failed on a cloud key", new TypeError("fetch failed", { cause: err("getaddrinfo EAI_AGAIN api", { code: "EAI_AGAIN" }) }), cloud, 503, "network"],
  ["slow Gemma on this computer", cannotConnect("UND_ERR_HEADERS_TIMEOUT", "Headers Timeout Error"), ollama, 504, "model_timeout", /longer than expected on this computer/],
  ["slow body on this computer", new TypeError("terminated", { cause: err("Body Timeout Error", { code: "UND_ERR_BODY_TIMEOUT" }) }), ollama, 504, "model_timeout"],
  ["Ollama not running", cannotConnect("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:11434"), ollama, 502, "model_unreachable", /Open the Ollama app/],
  ["local server not running", new TypeError("fetch failed", { cause: err("connect ECONNREFUSED", { code: "ECONNREFUSED" }) }), lmStudio, 502, "model_unreachable", /Is the server running/],
  ["bad key", err("API key not valid. Please pass a valid API key.", { statusCode: 400 }), cloud, 502, "model_auth"],
  ["forbidden", err("The caller does not have permission", { statusCode: 403 }), cloud, 502, "model_auth"],
  ["free limit", err("Resource has been exhausted (e.g. check quota).", { statusCode: 429 }), cloud, 502, "model_quota"],
  ["rate limit wording", err("Rate limit exceeded for this model"), cloud, 502, "model_quota"],
  ["wrong model name is not a quota", err("models/gemma-9 is not found for API version v1beta, or is not supported for generateContent.", { statusCode: 404 }), cloud, 502, "model_missing"],
  ["\"generate\" is not a quota", err("Failed to generate a response"), cloud, 502, "model_failed"],
  ["model not pulled", err("model 'gemma4:12b' not found, try pulling it first"), ollama, 502, "model_missing"],
  ["bad JSON from Gemma", err("Structured output validation failed"), demo, 502, "model_failed", /demo's Gemma host is busy/],
  ["a deadline is not a network failure", err("The operation was aborted due to timeout", { name: "TimeoutError" }), cloud, 502, "model_failed"],
];

describe("modelFailure", () => {
  it.each(cases)("%s", async (_, e, who, status, code, says) => {
    const res = modelFailure(e, who);
    expect(res.status).toBe(status);
    const data = (await res.json()) as { error: string; message: string };
    expect(data.error).toBe(code);
    if (says) expect(data.message).toMatch(says);
    expect(data.message).not.toMatch(/—|!/);
  });

  it("doesn't send hosted demo users to a local model they can't use", async () => {
    vi.stubEnv("DEIS_HOSTED", "1");
    const data = (await modelFailure(cannotConnect("ENOTFOUND", "getaddrinfo ENOTFOUND api"), demo).json()) as { message: string };
    expect(data.message).toBe("Couldn't reach the AI host. Try again in a minute.");
  });
});

describe("job input", () => {
  it("cuts a very long location to 300 characters instead of refusing the job", () => {
    const location = Array.from({ length: 60 }, (_, i) => `Office ${i}, Ireland`).join("; ");
    const out = jobInputSchema.parse({ id: "j1", title: "Head of Pricing", company: "Example", location, city: "Dublin", description: "Pricing." });
    expect(location.length).toBeGreaterThan(300);
    expect(out.location).toHaveLength(300);
  });
});
