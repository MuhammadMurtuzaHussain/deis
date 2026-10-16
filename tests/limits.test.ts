import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiSettings } from "@/lib/ai/settings";

// Key Value is a Map here, so every key the limiter writes can be checked.
const { hits } = vi.hoisted(() => ({ hits: new Map<string, number>() }));
vi.mock("@/lib/server/kv", () => ({
  kvHit: vi.fn(async (key: string) => {
    const n = (hits.get(key) ?? 0) + 1;
    hits.set(key, n);
    return n;
  }),
}));
// The limiter runs before any model is built; keep this test free of the model chain.
vi.mock("@/mastra/model", () => ({
  SettingsRejected: class extends Error {},
  modelChain: () => ({ tier: "demo", label: "test", models: [] }),
}));

import { clientIp, demoLimited, LIMIT_MESSAGES } from "@/lib/server/limits";
import { aiFor } from "@/lib/server/api";

const demo: AiSettings = { provider: "demo" };
const req = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://deis-bu83.onrender.com${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers } });
const from = (ip: string) => ({ "cf-connecting-ip": ip });

async function times(n: number, call: (i: number) => Promise<unknown>) {
  const out: unknown[] = [];
  for (let i = 0; i < n; i++) out.push(await call(i));
  return out;
}

beforeEach(() => {
  hits.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T12:10:00Z"));
  vi.stubEnv("DEIS_HOSTED", "1");
  vi.stubEnv("DEMO_HOURLY_CAP", "");
  vi.stubEnv("DEMO_DAILY_CAP", "");
  vi.stubEnv("SITE_URL", "https://deiscareers.tech");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("demo rate limits", () => {
  it("counts each route on its own: 25 cards, then a kit, passes", async () => {
    const cards = await times(25, () => demoLimited(req("/api/card", from("203.0.113.7")), demo, 200));
    expect(cards.every((r) => r === null)).toBe(true);
    expect(await demoLimited(req("/api/kit", from("203.0.113.7")), demo, 20)).toBeNull();
  });

  it("still stops one route at its own hourly limit", async () => {
    await times(20, () => demoLimited(req("/api/kit", from("203.0.113.7")), demo, 20));
    expect(await demoLimited(req("/api/kit", from("203.0.113.7")), demo, 20)).toBe("route");
    // Someone else is unaffected.
    expect(await demoLimited(req("/api/kit", from("203.0.113.8")), demo, 20)).toBeNull();
  });

  it("caps one person across all routes", async () => {
    const results = await times(151, () => demoLimited(req("/api/card", from("203.0.113.7")), demo, 200));
    expect(results.slice(0, 150).every((r) => r === null)).toBe(true);
    expect(results[150]).toBe("person");
  });

  it("isn't fooled by a made-up X-Forwarded-For", async () => {
    // Render appends the real address; clients can only put things in front of it.
    const spoofed = (i: number) => req("/api/kit", { "x-forwarded-for": `1.2.3.${i}, 198.51.100.9` });
    const results = await times(21, (i) => demoLimited(spoofed(i), demo, 20));
    expect(results[20]).toBe("route");
    // With Cloudflare's header present, X-Forwarded-For isn't read at all.
    expect(clientIp(req("/", { ...from("203.0.113.7"), "x-forwarded-for": "9.9.9.9" }))).toBe("203.0.113.7");
  });

  it("skips Render's own hops at the end of X-Forwarded-For", () => {
    expect(clientIp(req("/", { "x-forwarded-for": "6.6.6.6, 198.51.100.9, 10.0.0.3" }))).toBe("198.51.100.9");
    expect(clientIp(req("/", { "x-forwarded-for": "::ffff:198.51.100.9" }))).toBe("198.51.100.9");
  });

  it("counts an IPv6 /64 as one person", () => {
    expect(clientIp(req("/", from("2001:db8:1:2::5")))).toBe("2001:db8:1:2::/64");
    expect(clientIp(req("/", from("2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd")))).toBe("2001:db8:1:2::/64");
  });

  it("never uses a header string that isn't an IP address as a key", async () => {
    const junk = ["evil}*key", "300.1.1.1", "1.2.3.4:8080", "x".repeat(500), "<script>", "::1%en0"];
    for (const value of junk) {
      expect(clientIp(req("/", { "cf-connecting-ip": value, "x-forwarded-for": `${value}, also-not-an-ip` }))).toBe("unknown");
      await demoLimited(req("/api/card", { "cf-connecting-ip": value }), demo, 200);
    }
    for (const key of hits.keys()) expect(key).toMatch(/^rl:(card:unknown|total:unknown|demo|demo-day):\d+$/);
  });

  it("trips the demo-wide hourly and daily budgets", async () => {
    vi.stubEnv("DEMO_HOURLY_CAP", "5");
    const hourly = await times(6, (i) => demoLimited(req("/api/card", from(`203.0.113.${i + 1}`)), demo, 200));
    expect(hourly.slice(0, 5).every((r) => r === null)).toBe(true);
    expect(hourly[5]).toBe("hourly");

    hits.clear();
    vi.stubEnv("DEMO_HOURLY_CAP", "");
    vi.stubEnv("DEMO_DAILY_CAP", "3");
    const daily = await times(4, (i) => demoLimited(req("/api/card", from(`203.0.113.${i + 1}`)), demo, 200));
    expect(daily[3]).toBe("daily");
  });

  it("never limits the user's own key or a server that isn't the hosted demo", async () => {
    expect(await demoLimited(req("/api/kit"), { provider: "google", apiKey: "k".repeat(20), model: "gemma-4-26b-a4b-it" }, 0)).toBeNull();
    vi.stubEnv("DEIS_HOSTED", "");
    expect(await demoLimited(req("/api/kit"), demo, 0)).toBeNull();
    expect(hits.size).toBe(0);
  });
});

describe("aiFor", () => {
  it("says which limit was hit, with Retry-After", async () => {
    await times(20, () => aiFor(req("/api/kit", from("203.0.113.7")), "careful", 20));
    const res = (await aiFor(req("/api/kit", from("203.0.113.7")), "careful", 20)) as Response;
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited", limit: "route", message: LIMIT_MESSAGES.route });
    expect(Number(res.headers.get("retry-after"))).toBe(50 * 60);
  });

  it("refuses requests a cross-site page could send", async () => {
    const plain = new Request("https://deis-bu83.onrender.com/api/check", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
    expect(((await aiFor(plain, "light", 30)) as Response).status).toBe(415);
    const foreign = req("/api/check", { origin: "https://evil.example" });
    expect(((await aiFor(foreign, "light", 30)) as Response).status).toBe(403);
    const own = await aiFor(req("/api/check", { origin: "https://deiscareers.tech" }), "light", 30);
    expect(own).not.toBeInstanceOf(Response);
    // Render's own address still works for old links: the Origin matches the Host it was served from.
    const render = await aiFor(req("/api/check", { origin: "https://deis-bu83.onrender.com", host: "deis-bu83.onrender.com" }), "light", 30);
    expect(render).not.toBeInstanceOf(Response);
    const spoofed = req("/api/check", { origin: "https://evil.example", host: "deiscareers.tech" });
    expect(((await aiFor(spoofed, "light", 30)) as Response).status).toBe(403);
    expect(hits.size).toBeGreaterThan(0);
  });
});
