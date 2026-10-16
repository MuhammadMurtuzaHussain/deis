import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activate, licenceState } from "@/lib/server/licence";

const DAY = 86_400_000;
let file: string;

beforeEach(() => {
  file = path.join(mkdtempSync(path.join(tmpdir(), "deis-licence-")), "licence.json");
  vi.stubEnv("DEIS_DESKTOP", "1");
  vi.stubEnv("DEIS_POLAR_ORG_ID", "org_test");
  vi.stubEnv("DEIS_LICENCE_FILE", file);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const polar = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

describe("desktop licence", () => {
  it("is off outside the desktop app or without a Polar organisation", async () => {
    vi.stubEnv("DEIS_POLAR_ORG_ID", "");
    expect(await licenceState()).toEqual({ state: "off" });
  });

  it("starts a 14-day trial, then locks", async () => {
    expect(await licenceState()).toEqual({ state: "trial", daysLeft: 14 });
    writeFileSync(file, JSON.stringify({ firstRunAt: Date.now() - 15 * DAY }));
    expect(await licenceState()).toEqual({ state: "locked" });
  });

  it("unlocks with a key Polar grants, and refuses one it doesn't", async () => {
    writeFileSync(file, JSON.stringify({ firstRunAt: Date.now() - 15 * DAY }));
    polar(404, { detail: "not found" });
    expect((await activate("DEIS-BAD-KEY-0000")).ok).toBe(false);
    polar(200, { status: "granted", customer: { name: "Aoife" } });
    expect((await activate("DEIS-GOOD-KEY-1234")).ok).toBe(true);
    expect(await licenceState()).toEqual({ state: "licensed", customer: "Aoife" });
  });

  it("stays licensed offline when the monthly re-check can't reach Polar", async () => {
    writeFileSync(file, JSON.stringify({ firstRunAt: 0, key: "K-1234-5678", validatedAt: Date.now() - 40 * DAY, customer: null }));
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect((await licenceState()).state).toBe("licensed");
    expect(JSON.parse(readFileSync(file, "utf8")).key).toBe("K-1234-5678");
  });

  const lapsed = () => writeFileSync(file, JSON.stringify({ firstRunAt: 0, key: "K-1234-5678", validatedAt: Date.now() - 40 * DAY, customer: "Aoife" }));
  const stored = () => JSON.parse(readFileSync(file, "utf8"));

  it("stays licensed when Polar is busy, refuses or fails (429, 403, 5xx)", async () => {
    for (const status of [429, 403, 500, 503]) {
      lapsed();
      polar(status, { detail: "nope" });
      expect((await licenceState()).state).toBe("licensed");
      expect(stored().key).toBe("K-1234-5678");
    }
  });

  it("takes the licence away only on a definite answer, and keeps the key", async () => {
    for (const [status, body] of [
      [404, { detail: "not found" }],
      [200, { status: "revoked" }],
      [200, { status: "disabled" }],
    ] as const) {
      lapsed();
      polar(status, body);
      expect((await licenceState()).state).toBe("locked");
      expect(stored()).toMatchObject({ key: "K-1234-5678" });
      expect(stored().refusedAt).toBeTypeOf("number");
    }
  });

  it("doesn't contact Polar at all in offline mode", async () => {
    vi.stubEnv("DEIS_OFFLINE", "1");
    lapsed();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await licenceState()).state).toBe("licensed");
    expect((await activate("DEIS-GOOD-KEY-1234")).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
