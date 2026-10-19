import { describe, expect, it } from "vitest";
import { ApiError, deadlineFor, isPausable, kindOf } from "@/lib/client/api";
import { factsKey } from "@/lib/client/db";
import { effectiveModel, type ServerStatus } from "@/lib/client/model";
import { isOffline, isStale, offlineBanner, savedOn } from "@/lib/client/offline";
import { parseHash, routeHref } from "@/lib/client/store";

const status = (o: Partial<ServerStatus> = {}): ServerStatus => ({
  hosted: false,
  desktop: false,
  demoModel: false,
  offline: { mode: "off" },
  demoHosts: [],
  services: { jobSearch: false, tracing: false, cache: "memory" },
  ...o,
});

describe("effectiveModel", () => {
  it("is the demo server on the hosted demo, and says so", () => {
    const m = effectiveModel(null, status({ hosted: true, demoModel: true, demoHosts: [{ label: "Google AI Studio", model: "gemma-4-26b-a4b-it", healthy: true }] }));
    expect(m.tier).toBe("demo");
    expect(m.privacy.where).toBe("deis demo server");
    expect(m.privacy.badge).toBe("Sent to the Deis demo server");
    expect(m.chosen).toBe(false);
  });

  it("is Gemma on this computer for an unset choice on the desktop with no demo hosts", () => {
    const m = effectiveModel(null, status({ desktop: true }));
    expect(m.label).toBe("Gemma on this computer");
    expect(m.privacy.where).toBe("this computer");
    expect(m.standIn).toBe(true);
    expect(m.worksOffline).toBe(true);
  });

  it("names Google when a local run forwards the demo to AI Studio (UX-5)", () => {
    const m = effectiveModel(null, status({ demoModel: true, demoHosts: [{ label: "Google AI Studio", model: "gemma-4-26b-a4b-it", healthy: true }, { label: "127.0.0.1:11434", model: "gemma4:e4b", healthy: true }] }));
    expect(m.privacy.where).toBe("google");
    expect(m.privacy.sentence).toMatch(/Google AI Studio/);
    expect(m.detail).toMatch(/127\.0\.0\.1:11434/);
  });

  it("names Anthropic or OpenAI when the user brings their own key", () => {
    const a = effectiveModel({ provider: "anthropic", apiKey: "sk-ant-test-0000000000", model: "claude-sonnet-5-5", effort: "high" }, status({}));
    expect(a.privacy.where).toBe("anthropic");
    expect(a.privacy.badge).toBe("Sent to Anthropic");
    expect(a.detail).toBe("claude-sonnet-5-5 on your Anthropic key, high effort");
    const o = effectiveModel({ provider: "openaiApi", apiKey: "sk-test-0000000000", model: "gpt-5.5", effort: "low" }, status({ offline: { mode: "on" } }));
    expect(o.privacy.where).toBe("openai");
    expect(o.usable).toBe(false);
  });

  it("stands in with local Gemma for the demo in offline mode", () => {
    const m = effectiveModel(null, status({ demoModel: true, offline: { mode: "on" } }));
    expect(m.tier).toBe("local");
  });

  it("refuses cloud choices in offline mode but keeps local ones", () => {
    const off = status({ offline: { mode: "forced" } });
    expect(effectiveModel({ provider: "google", apiKey: "AIza-test-key-123", model: "gemma-4-26b-a4b-it" }, off).usable).toBe(false);
    const local = effectiveModel({ provider: "ollama", baseUrl: "http://127.0.0.1:11434/api", model: "gemma4:e4b" }, off);
    expect(local.usable).toBe(true);
    expect(local.privacy.badge).toBe("Stays on this computer");
  });

  it("treats a remote Ollama as your server, and Ollama on the hosted demo as unusable", () => {
    expect(effectiveModel({ provider: "ollama", baseUrl: "http://10.0.0.5:11434/api", model: "gemma4:e4b" }, status()).privacy.where).toBe("your server");
    expect(effectiveModel({ provider: "ollama", baseUrl: "http://127.0.0.1:11434/api", model: "gemma4:e4b" }, status({ hosted: true })).usable).toBe(false);
  });
});

describe("offline helpers", () => {
  const thu = new Date(2026, 9, 15, 14, 5).getTime();

  it("formats the saved date in Irish English without a comma after the day", () => {
    expect(savedOn(thu)).toBe("Thu 15 Oct");
    expect(savedOn(thu, true)).toBe("Thu 15 Oct, 14:05");
    expect(savedOn("not a date")).toBeNull();
  });

  it("words the banner for each case", () => {
    expect(offlineBanner({ browserOnline: true, mode: "off" }, thu)).toBeNull();
    expect(offlineBanner({ browserOnline: false, mode: "off" }, thu)?.text).toBe("No internet. Showing jobs saved on Thu 15 Oct.");
    expect(offlineBanner({ browserOnline: false, mode: "off" }, thu, { hosted: true })?.offerOfflineMode).toBe(false);
    expect(offlineBanner({ browserOnline: true, mode: "on" }, null)?.text).toBe("Offline mode is on.");
    expect(offlineBanner({ browserOnline: true, mode: "off", reachable: false }, null, { hosted: true })).toBeNull();
  });

  it("counts offline mode and no network, not a single failed call", () => {
    expect(isOffline({ browserOnline: true, mode: "forced" })).toBe(true);
    expect(isOffline({ browserOnline: false, mode: "off" })).toBe(true);
    expect(isOffline({ browserOnline: true, mode: "off", reachable: false })).toBe(false);
  });

  it("calls jobs stale after three days", () => {
    expect(isStale(thu, thu + 2 * 86_400_000)).toBe(false);
    expect(isStale(thu, thu + 4 * 86_400_000)).toBe(true);
  });
});

describe("client api errors", () => {
  it("maps server codes to kinds", () => {
    expect(kindOf("offline", 503)).toBe("offline");
    expect(kindOf("feed_unreachable", 503)).toBe("network");
    expect(kindOf("network", 503)).toBe("network");
    expect(kindOf("model_timeout", 504)).toBe("timeout");
    expect(kindOf("rate_limited", 429)).toBe("rate_limited");
    expect(kindOf("model_quota", 502)).toBe("model");
    expect(kindOf("settings_rejected", 400)).toBe("model");
    expect(kindOf("bad_request", 400)).toBe("bad_request");
    expect(kindOf("error", 500)).toBe("model");
  });

  it("pauses the queue only on offline and network", () => {
    expect(isPausable(new ApiError("x", "offline", 503))).toBe(true);
    expect(isPausable(new ApiError("x", "model_failed", 502))).toBe(false);
    expect(isPausable(new Error("x"))).toBe(false);
  });

  it("gives local Gemma longer than the cloud", () => {
    expect(deadlineFor("/api/kit", "local")).toBeGreaterThan(deadlineFor("/api/kit", "demo"));
    expect(deadlineFor("/api/card", "cloud")).toBeGreaterThan(80_000);
  });
});

describe("routes and cache keys", () => {
  it("parses the demo route", () => {
    expect(parseHash("#/demo/aoife")).toEqual({ name: "demo", persona: "aoife" });
    expect(routeHref({ name: "demo", persona: "rahul" })).toBe("#/demo/rahul");
    expect(parseHash("#/licence")).toEqual({ name: "licence" });
  });

  it("changes the facts key when confirmed facts change, and only then", () => {
    const a = [{ id: "a1", text: "Built a dashboard", confirmed: true }];
    expect(factsKey(a)).toBe(factsKey([...a, { id: "x", text: "draft", confirmed: false }]));
    expect(factsKey(a)).not.toBe(factsKey([{ ...a[0], text: "Built two dashboards" }]));
  });
});
