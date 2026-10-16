import http from "node:http";
import net, { type AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Offline mode: with it on, the Deis server connects to nothing but loopback. Each test
// records every URL fetched, and fails on anything that isn't this computer.

const realFetch = globalThis.fetch;
let calls: string[] = [];
const outside = () => calls.filter((u) => !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(u));

beforeEach(() => {
  vi.resetModules();
  calls = [];
  vi.stubEnv("DEIS_OFFLINE", "1");
  for (const k of ["DEIS_HOSTED", "DEIS_STATE_DIR", "DEIS_FEED_URL", "SERPAPI_KEY", "REDIS_URL", "GOOGLE_GENERATIVE_AI_API_KEY", "FALLBACK_BASE_URL", "FALLBACK_MODEL"]) vi.stubEnv(k, "");
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string | URL | Request, init?: RequestInit) => {
      calls.push(String(url instanceof Request ? url.url : url));
      return realFetch(url, init);
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const feedRequest = () => new Request("http://127.0.0.1/api/feed", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ categories: ["software"] }) });

describe("offline mode", () => {
  it("answers the feed from this computer only: 503 offline when nothing is saved", async () => {
    const { POST } = await import("@/app/api/feed/route");
    const res = await POST(feedRequest());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("offline");
    expect(calls).toEqual([]);
  });

  it("keeps a licence valid without asking Polar", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "deis-licence-")), "licence.json");
    writeFileSync(file, JSON.stringify({ firstRunAt: 0, key: "K-1234-5678", validatedAt: Date.now() - 40 * 86_400_000, customer: null }));
    vi.stubEnv("DEIS_DESKTOP", "1");
    vi.stubEnv("DEIS_POLAR_ORG_ID", "org_test");
    vi.stubEnv("DEIS_LICENCE_FILE", file);
    const { licenceState } = await import("@/lib/server/licence");
    expect((await licenceState()).state).toBe("licensed");
    expect(calls).toEqual([]);
  });

  it("refuses AI Studio and a remote Ollama", async () => {
    const { modelChain } = await import("@/mastra/model");
    expect(() => modelChain({ provider: "google", apiKey: "AIza-test-key-0000000000000", model: "gemma-4-26b-a4b-it" })).toThrow(/Offline mode is on/);
    expect(() => modelChain({ provider: "ollama", baseUrl: "http://10.0.0.5:11434/api", model: "gemma4:e4b" })).toThrow(/Offline mode is on/);
  });

  it("answers a cloud model choice with 503 offline, not a bad-settings 400", async () => {
    const { aiFor } = await import("@/lib/server/api");
    const { AI_HEADER, encodeSettings } = await import("@/lib/ai/settings");
    const headers = { "content-type": "application/json", [AI_HEADER]: encodeSettings({ provider: "google", apiKey: "AIza-test-key-0000000000000", model: "gemma-4-26b-a4b-it" }) };
    const res = await aiFor(new Request("http://127.0.0.1/api/card", { method: "POST", headers, body: "{}" }), "light");
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(503);
    expect(await (res as Response).json()).toMatchObject({ error: "offline", message: expect.stringMatching(/Offline mode is on/) });
    expect(calls).toEqual([]);
  });

  it("builds a kit's three parts against a loopback Ollama, one call at a time, touching only 127.0.0.1", async () => {
    let busy = 0;
    let overlapped = false;
    const srv = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        busy++;
        if (busy > 1) overlapped = true;
        const stream = (JSON.parse(raw || "{}") as { stream?: boolean }).stream;
        const at = new Date().toISOString();
        const msg = (content: string, done: boolean) => JSON.stringify({ model: "gemma4:e4b", created_at: at, message: { role: "assistant", content }, done, ...(done ? { done_reason: "stop", eval_count: 3 } : {}) });
        setTimeout(() => {
          busy--;
          res.writeHead(200, { "content-type": stream ? "application/x-ndjson" : "application/json" });
          res.end(stream ? `${msg('{"text": "ok"}', false)}\n${msg("", true)}\n` : msg('{"text": "ok"}', true));
        }, 30);
      });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api`;
    const { modelChain } = await import("@/mastra/model");
    const { structured } = await import("@/mastra/gemma");
    const chain = modelChain({ provider: "ollama", baseUrl: base, model: "gemma4:e4b" }, "writing");
    const part = (task: "cv" | "letter" | "answers", agent: "cvAgent" | "letterAgent" | "answersAgent") => structured(task, agent, chain, "Write it.", z.object({ text: z.string() }), { maxOutputTokens: 50 });
    const parts = await Promise.all([part("cv", "cvAgent"), part("letter", "letterAgent"), part("answers", "answersAgent")]);
    srv.close();
    expect(parts.map((p) => p.data.text)).toEqual(["ok", "ok", "ok"]);
    expect(calls.filter((u) => u.endsWith("/chat"))).toHaveLength(3);
    expect(outside()).toEqual([]);
    expect(overlapped).toBe(false);
  });

  it("blocks sockets to the internet before DNS, while loopback and Unix sockets still work", async () => {
    const { installEgressGuard } = await import("@/lib/server/net");
    installEgressGuard();
    const srv = http.createServer((_req, res) => res.end("here"));
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const sock = path.join(mkdtempSync(path.join(tmpdir(), "deis-sock-")), "s.sock");
    const unix = net.createServer((c) => c.end("unix"));
    await new Promise<void>((r) => unix.listen(sock, r));
    try {
      const err = await realFetch("https://example.com").catch((e: { cause?: { code?: string } }) => e);
      expect((err as { cause?: { code?: string } }).cause?.code).toBe("DEIS_OFFLINE");
      const local = await realFetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/`);
      expect(await local.text()).toBe("here");
      const viaUnix = await new Promise<string>((resolve, reject) => {
        const c = net.connect({ path: sock });
        let got = "";
        c.on("data", (d) => (got += d));
        c.on("end", () => resolve(got));
        c.on("error", reject);
      });
      expect(viaUnix).toBe("unix");
      // With offline mode off, the guard steps aside (checked per connection).
      vi.stubEnv("DEIS_OFFLINE", "");
      const again = await realFetch(`http://localhost:${(srv.address() as AddressInfo).port}/`);
      expect(again.status).toBe(200);
    } finally {
      srv.close();
      unix.close();
    }
  });

  it("can't be switched on the hosted demo, or off when forced", async () => {
    const { POST } = await import("@/app/api/offline/route");
    const ask = (on: boolean) => POST(new Request("http://127.0.0.1/api/offline", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on }) }));
    expect((await ask(false)).status).toBe(403);
    vi.stubEnv("DEIS_OFFLINE", "");
    vi.stubEnv("DEIS_HOSTED", "1");
    expect((await ask(true)).status).toBe(403);
    vi.stubEnv("DEIS_HOSTED", "");
    expect(await (await ask(true)).json()).toEqual({ mode: "on" });
    expect(await (await ask(false)).json()).toEqual({ mode: "off" });
  });
});

describe("connections already open when offline mode is switched on", () => {
  it("closes a remote Key Value and uses this process's own cache instead", async () => {
    vi.stubEnv("DEIS_OFFLINE", "");
    vi.stubEnv("REDIS_URL", "redis://kv.example.com:6379");
    const made: { disconnect: ReturnType<typeof vi.fn> }[] = [];
    vi.doMock("ioredis", () => ({
      Redis: class {
        disconnect = vi.fn();
        constructor() {
          made.push(this);
        }
        on() {
          return this;
        }
        async get() {
          return null;
        }
      },
    }));
    const net = await import("@/lib/server/net");
    const kv = await import("@/lib/server/kv");
    try {
      await kv.kvGet("x");
      expect(made).toHaveLength(1);
      net.setOfflineMode(true);
      expect(made[0].disconnect).toHaveBeenCalled();
      await kv.kvSet("y", 1, 60);
      expect(await kv.kvGet("y")).toBe(1);
      expect(made).toHaveLength(1);
    } finally {
      net.setOfflineMode(false);
      vi.doUnmock("ioredis");
    }
  });
});
