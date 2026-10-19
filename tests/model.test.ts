import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// The model chain, built per request: which hosts, in which order, with which retries, and
// what offline mode allows. Model calls here go to a fake Ollama on 127.0.0.1, never to Gemma.

const load = async () => {
  vi.resetModules();
  return import("@/mastra/model");
};
const ids = (c: { models: { id?: string }[] }) => c.models.map((m) => m.id);

/** Answers for the probe and Ollama's model list, so no test touches the network. */
const quietFetch = (tags: string[] = ["gemma4:e4b"], probeStatus = 200) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request) => {
      const u = String(url instanceof Request ? url.url : url);
      if (u.endsWith("/api/tags")) return Response.json({ models: tags.map((name) => ({ name, size: 1e9 })) });
      return new Response("{}", { status: u.includes("generativelanguage") ? probeStatus : 200 });
    }),
  );

beforeEach(() => {
  for (const k of ["GOOGLE_GENERATIVE_AI_API_KEY", "FALLBACK_BASE_URL", "FALLBACK_MODEL", "FALLBACK_API_KEY", "FALLBACK_2_BASE_URL", "FALLBACK_2_MODEL", "FALLBACK_2_API_KEY", "DEIS_OFFLINE", "DEIS_HOSTED", "DEIS_STATE_DIR", "GOOGLE_MODEL"]) vi.stubEnv(k, "");
  quietFetch();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("demo chain", () => {
  it("asks AI Studio, then each fallback host in order, with no retries and no 31B", async () => {
    vi.stubEnv("DEIS_HOSTED", "1");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "AIza-test-key-0000000000000");
    vi.stubEnv("FALLBACK_BASE_URL", "https://api.groq.com/openai/v1");
    vi.stubEnv("FALLBACK_MODEL", "gemma-4-26b");
    vi.stubEnv("FALLBACK_API_KEY", "gsk-test");
    vi.stubEnv("FALLBACK_2_BASE_URL", "https://openrouter.ai/api/v1");
    vi.stubEnv("FALLBACK_2_MODEL", "google/gemma-4-26b-a4b-it");
    vi.stubEnv("FALLBACK_2_API_KEY", "sk-or-test");
    const { modelChain, demoHosts } = await load();
    const chain = modelChain({ provider: "demo" }, "careful");
    expect(chain.tier).toBe("demo");
    expect(ids(chain)).toEqual(["demo:gemma-4-26b-a4b-it", "openai:api.groq.com:gemma-4-26b", "openai:openrouter.ai:google/gemma-4-26b-a4b-it"]);
    expect(chain.models.every((m) => m.maxRetries === 0)).toBe(true);
    expect(demoHosts().map((h) => h.label)).toEqual(["Google AI Studio", "Groq", "OpenRouter"]);
  });

  it("keeps 31B as AI Studio's second try only when there's no other host", async () => {
    vi.stubEnv("DEIS_HOSTED", "1");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "AIza-test-key-0000000000000");
    const { modelChain } = await load();
    expect(ids(modelChain({ provider: "demo" }))).toEqual(["demo:gemma-4-26b-a4b-it", "demo:gemma-4-31b-it"]);
  });

  it("sends AI Studio to the back of the queue after a failed probe", async () => {
    vi.stubEnv("DEIS_HOSTED", "1");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "AIza-test-key-0000000000000");
    vi.stubEnv("FALLBACK_BASE_URL", "https://openrouter.ai/api/v1");
    vi.stubEnv("FALLBACK_MODEL", "google/gemma-4-26b-a4b-it");
    vi.stubEnv("FALLBACK_API_KEY", "sk-or-test");
    quietFetch([], 500);
    const { modelChain, demoHosts } = await load();
    modelChain({ provider: "demo" });
    await vi.waitFor(() => expect(demoHosts()[0].healthy).toBe(false));
    expect(ids(modelChain({ provider: "demo" }))[0]).toBe("openai:openrouter.ai:google/gemma-4-26b-a4b-it");
  });

  it("leaves out a rented fallback host whose key isn't set, but not one on this computer", async () => {
    vi.stubEnv("DEIS_HOSTED", "1");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "AIza-test-key-0000000000000");
    vi.stubEnv("FALLBACK_BASE_URL", "https://openrouter.ai/api/v1");
    vi.stubEnv("FALLBACK_MODEL", "google/gemma-4-26b-a4b-it");
    vi.stubEnv("FALLBACK_2_BASE_URL", "http://127.0.0.1:8080/v1");
    vi.stubEnv("FALLBACK_2_MODEL", "gemma-4");
    const { demoHosts } = await load();
    expect(demoHosts().map((h) => h.label)).toEqual(["Google AI Studio", "Gemma on this computer"]);
  });
});

describe("local models", () => {
  const ollama = { provider: "ollama" as const, baseUrl: "http://127.0.0.1:11434/api", model: "gemma4:e4b", kitModel: "gemma4:12b" };

  it("writes the kit with kitModel, falling back to the usual model; other work stays on the usual one", async () => {
    const { modelChain } = await load();
    expect(ids(modelChain(ollama, "writing"))).toEqual(["ollama:gemma4:12b", "ollama:gemma4:e4b"]);
    expect(ids(modelChain(ollama, "careful"))).toEqual(["ollama:gemma4:e4b"]);
    expect(ids(modelChain({ ...ollama, kitModel: undefined }, "writing"))).toEqual(["ollama:gemma4:e4b"]);
  });

  it("uses one context size for every local call, so Ollama never reloads between a card and a kit", async () => {
    const { modelChain, NUM_CTX } = await load();
    const ctx = (effort: "light" | "careful" | "writing") => (modelChain(ollama, effort).models[0].providerOptions as { ollama: { options: { num_ctx: number } } }).ollama.options.num_ctx;
    expect([ctx("light"), ctx("careful"), ctx("writing")]).toEqual([NUM_CTX, NUM_CTX, NUM_CTX]);
  });

  it("treats writing like careful for every provider but Ollama", async () => {
    const { modelChain } = await load();
    const google = { provider: "google" as const, apiKey: "AIza-test-key-0000000000000", model: "gemini-3-flash" };
    expect(modelChain(google, "writing").models.map((m) => [m.id, m.providerOptions])).toEqual(modelChain(google, "careful").models.map((m) => [m.id, m.providerOptions]));
  });
});

describe("your own Anthropic or OpenAI key", () => {
  it("sends Claude the effort setting and tags the tier as cloud", async () => {
    const { modelChain } = await load();
    const c = modelChain({ provider: "anthropic", apiKey: "sk-ant-test-0000000000", model: "claude-sonnet-5-5", effort: "high" }, "careful");
    expect(c.tier).toBe("cloud");
    expect(c.label).toMatch(/claude-sonnet-5-5.*Anthropic/);
    expect(c.models).toHaveLength(1);
    expect(c.models[0].providerOptions).toEqual({ anthropic: { effort: "high" } });
  });

  it("sends GPT the reasoning effort", async () => {
    const { modelChain } = await load();
    const c = modelChain({ provider: "openaiApi", apiKey: "sk-test-0000000000", model: "gpt-5.5", effort: "low" });
    expect(c.tier).toBe("cloud");
    expect(c.models[0].providerOptions).toEqual({ openai: { reasoningEffort: "low" } });
  });

  it("defaults to Sonnet at medium effort when the saved settings omit them", async () => {
    const { aiSettingsSchema } = await import("@/lib/ai/settings");
    expect(aiSettingsSchema.parse({ provider: "anthropic", apiKey: "sk-ant-test-0000000000" })).toMatchObject({ model: "claude-sonnet-5-5", effort: "medium" });
    expect(aiSettingsSchema.safeParse({ provider: "anthropic", apiKey: "sk-ant-test-0000000000", effort: "extreme" }).success).toBe(false);
  });

  it("is refused in offline mode", async () => {
    vi.stubEnv("DEIS_OFFLINE", "1");
    const { modelChain } = await load();
    expect(() => modelChain({ provider: "anthropic", apiKey: "sk-ant-test-0000000000", model: "claude-sonnet-5-5", effort: "medium" })).toThrow(/Offline mode is on/);
  });
});

describe("offline mode", () => {
  beforeEach(() => vi.stubEnv("DEIS_OFFLINE", "1"));

  it("refuses cloud and remote providers with a message that says what to do", async () => {
    const { modelChain, OFFLINE_MESSAGE } = await load();
    const refused = [
      { provider: "google" as const, apiKey: "AIza-test-key-0000000000000", model: "gemma-4-26b-a4b-it" },
      { provider: "ollama" as const, baseUrl: "http://192.168.1.20:11434/api", model: "gemma4:e4b" },
      { provider: "openai" as const, baseUrl: "https://openrouter.ai/api/v1", model: "google/gemma-4-26b-a4b-it" },
    ];
    for (const s of refused) {
      const e = (() => {
        try {
          modelChain(s);
        } catch (err) {
          return err as { message: string; code?: string };
        }
      })();
      expect(e).toMatchObject({ message: OFFLINE_MESSAGE, code: "DEIS_OFFLINE" });
    }
    expect(modelChain({ provider: "ollama", baseUrl: "http://127.0.0.1:11434/api", model: "gemma4:e4b" }).tier).toBe("local");
    expect(modelChain({ provider: "openai", baseUrl: "http://localhost:1234/v1", model: "gemma" }).tier).toBe("local");
  });

  it("puts the demo on Gemma on this computer when Ollama has one, and refuses when it has none", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "AIza-test-key-0000000000000");
    let mod = await load();
    await mod.localModels();
    expect(ids(mod.modelChain({ provider: "demo" }))).toEqual(["ollama:gemma4:e4b"]);
    quietFetch(["llama3.2:latest"]);
    mod = await load();
    await mod.localModels();
    expect(() => mod.modelChain({ provider: "demo" })).toThrow(mod.OFFLINE_MESSAGE);
  });
});

// ---- structured(): the JSON-only retry, against a fake Ollama

type Reply = { status: number; content?: string };
async function fakeOllama(replies: Reply[]) {
  const seen: string[] = [];
  const srv = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      seen.push(req.url ?? "");
      const r = replies[Math.min(seen.length - 1, replies.length - 1)];
      if (r.status !== 200) return void res.writeHead(r.status, { "content-type": "application/json" }).end(JSON.stringify({ error: "busy" }));
      const stream = (JSON.parse(raw || "{}") as { stream?: boolean }).stream;
      const at = new Date().toISOString();
      const chunk = (content: string, done: boolean) => ({ model: "gemma4:e4b", created_at: at, message: { role: "assistant", content }, done, ...(done ? { done_reason: "stop", prompt_eval_count: 5, eval_count: 3 } : {}) });
      if (stream) {
        res.writeHead(200, { "content-type": "application/x-ndjson" });
        res.end(`${JSON.stringify(chunk(r.content ?? "", false))}\n${JSON.stringify(chunk("", true))}\n`);
      } else res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(chunk(r.content ?? "", true)));
    });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api`, seen, close: () => srv.close() };
}

describe("structured()", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("retries once after a reply that isn't JSON", async () => {
    const fake = await fakeOllama([{ status: 200, content: "Sure! Here you go." }, { status: 200, content: '{"ok": true}' }]);
    const { modelChain } = await load();
    const { structured } = await import("@/mastra/gemma");
    const out = await structured("card", "cardAgent", modelChain({ provider: "ollama", baseUrl: fake.url, model: "gemma4:e4b" }), 'Reply with {"ok": true}.', z.object({ ok: z.boolean() }), { maxOutputTokens: 30 });
    expect(out.data).toEqual({ ok: true });
    expect(fake.seen.filter((u) => u.endsWith("/chat"))).toHaveLength(2);
    expect(out.usage.host).toBe("Ollama");
    fake.close();
  });

  it("doesn't run the whole chain again after a host error", async () => {
    const fake = await fakeOllama([{ status: 500 }]);
    const { modelChain } = await load();
    const { structured } = await import("@/mastra/gemma");
    await expect(structured("card", "cardAgent", modelChain({ provider: "ollama", baseUrl: fake.url, model: "gemma4:e4b" }), "Reply.", z.object({ ok: z.boolean() }), { maxOutputTokens: 30 })).rejects.toThrow();
    // The entry's own retry (maxRetries 1) makes 2. A second structured() attempt would make 4, and
    // Mastra's default error processors, if they weren't off, 6.
    expect(fake.seen.filter((u) => u.endsWith("/chat"))).toHaveLength(2);
    fake.close();
  }, 30_000);
});

describe("OpenRouter routing", () => {
  it("asks the reliable providers first and keeps the rest of the request", async () => {
    const { preferProviders, OPENROUTER_PROVIDERS } = await load();
    let sent: Record<string, unknown> = {};
    const base = (async (_: unknown, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return new Response("{}");
    }) as typeof fetch;
    await preferProviders(base)("https://openrouter.ai/api/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "google/gemma-4-26b-a4b-it", stream: true }) });
    expect(sent).toEqual({ model: "google/gemma-4-26b-a4b-it", stream: true, provider: { order: OPENROUTER_PROVIDERS, allow_fallbacks: true } });
  });
});
