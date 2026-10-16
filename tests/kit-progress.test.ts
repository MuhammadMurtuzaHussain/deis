import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestContext } from "@mastra/core/request-context";
import { MockLanguageModelV3 } from "ai/test";
import { ApiError, apiStream } from "@/lib/client/api";
import { aoife } from "@/lib/demo/personas";
import type { ScoredJob } from "@/lib/jobs/types";
import { KIT_STREAM, progressLine, progressStart, stepEvent, withEvent, type KitStepEvent } from "@/lib/kit-progress";
import { mastra } from "@/mastra";
import type { ModelChain } from "@/mastra/model";

// The kit's progress while it's written: the workflow's step events, as names and
// counts, read by the client one line at a time.

const step = (e: Omit<KitStepEvent, "type">): KitStepEvent => ({ type: "step", ...e });

describe("kit progress line", () => {
  it("follows the fit, then each part, then assembly", () => {
    let p = progressStart("running");
    expect(progressLine(p)).toBe("Checking how you fit the role.");
    p = progressStart("done");
    expect(progressLine(p)).toBe("Fit checked. Writing your CV, letter and answers.");
    p = withEvent(p, step({ step: "cv", status: "running" }));
    p = withEvent(p, step({ step: "letter", status: "running" }));
    p = withEvent(p, step({ step: "cv", status: "done", removed: 2 }));
    expect(progressLine(p)).toBe("Fit checked. CV written; the guard removed 2 lines. Still writing the letter and answers.");
    p = withEvent(p, step({ step: "answers", status: "done", removed: 0 }));
    expect(progressLine(p)).toBe("Fit checked. CV and answers written; the guard removed 2 lines. Still writing the letter.");
    p = withEvent(p, step({ step: "letter", status: "done", removed: 1, failed: true }));
    p = withEvent(p, step({ step: "assemble", status: "running" }));
    expect(progressLine(p)).toBe("Fit checked. All written; the guard removed 3 lines. Putting your kit together. The letter didn't come through.");
  });

  it("leaves out parts the user turned off, and the fit when it was already checked", () => {
    let p = progressStart(null);
    p = withEvent(p, step({ step: "letter", status: "done", removed: 0, skipped: true }));
    p = withEvent(p, step({ step: "answers", status: "done", removed: 0, skipped: true }));
    expect(progressLine(p)).toBe("Writing your CV.");
    p = withEvent(p, step({ step: "cv", status: "done", removed: 1 }));
    expect(progressLine(p)).toBe("CV written; the guard removed 1 line.");
  });
});

describe("kit workflow stream", () => {
  const job = { id: "j1", title: "Graduate Software Engineer", company: "Cisco", location: "Galway", city: "Galway", description: "Build collaboration software in Python and React." } as unknown as ScoredJob;
  const fit = { verdict: "good" as const, requirements: [{ need: "Testing", match: "strong" as const, facts: ["ab7"], note: "" }], angle: "" };
  const replies: Record<string, string> = {
    cv: JSON.stringify({
      profile: [{ text: "Computer science graduate who raised unit-test coverage from 41% to 68%.", facts: ["ab1", "ab7"] }],
      roles: [{ org: "Harbour Payments", bullets: [{ text: "Raised unit-test coverage on the refunds service from 41% to 68%.", facts: ["ab7"] }, { text: "Led 40 engineers.", facts: ["ab7"] }] }],
    }),
    letter: JSON.stringify({ paragraphs: [{ text: "I raised test coverage from 41% to 68% at Harbour Payments.", facts: ["ab7"] }] }),
  };
  const which = (p: string) => (p.includes("cover letter body") ? "letter" : "cv");
  const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
  const model = new MockLanguageModelV3({
    doGenerate: async (o) => ({ content: [{ type: "text", text: replies[which(JSON.stringify(o.prompt))] }], finishReason: { unified: "stop", raw: "stop" }, usage, warnings: [] }),
  });
  const chain = { tier: "local", label: "mock", models: [{ id: "mock", model, maxRetries: 0 }] } as unknown as ModelChain;

  it("tells each step's start and finish, with the guard's removals and no text", async () => {
    const run = await mastra.getWorkflow("kitWorkflow").createRun();
    const stream = run.stream({ inputData: { job, profile: aoife, fit, include: { letter: true, answers: false } }, requestContext: new RequestContext<unknown>([["chain", chain]]) });
    const events: KitStepEvent[] = [];
    for await (const chunk of stream) {
      const e = stepEvent(chunk as Parameters<typeof stepEvent>[0]);
      if (e) events.push(e);
    }
    expect((await stream.result).status).toBe("success");
    const done = Object.fromEntries(events.filter((e) => e.status === "done").map((e) => [e.step, e]));
    expect(Object.keys(done).sort()).toEqual(["answers", "assemble", "checks", "cv", "letter"]);
    expect(done.cv.removed).toBeGreaterThan(0);
    expect(done.letter).toMatchObject({ removed: 0 });
    expect(done.answers).toMatchObject({ skipped: true });
    expect(events.findIndex((e) => e.step === "assemble")).toBeGreaterThan(events.findIndex((e) => e.step === "cv" && e.status === "done"));
    expect(JSON.stringify(events)).not.toMatch(/Harbour|coverage|engineers|Aoife/);
  });
});

describe("apiStream", () => {
  afterEach(() => vi.unstubAllGlobals());
  const respond = (lines: string[], init: ResponseInit = {}) => {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        const text = new TextEncoder().encode(lines.join(""));
        // Split mid-line, as a network would.
        c.enqueue(text.slice(0, 17));
        c.enqueue(text.slice(17));
        c.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { headers: { "content-type": KIT_STREAM }, ...init })));
  };
  const line = (x: unknown) => `${JSON.stringify(x)}\n`;

  it("hands each step line on and returns the result", async () => {
    respond([line({ type: "step", step: "cv", status: "running" }), line({ type: "step", step: "cv", status: "done", removed: 1 }), line({ type: "result", data: { ok: 1 } })]);
    const seen: unknown[] = [];
    await expect(apiStream("/api/kit", {}, (l) => seen.push(l), { timeoutMs: 0, ai: { provider: "demo" } })).resolves.toEqual({ ok: 1 });
    expect(seen).toEqual([
      { type: "step", step: "cv", status: "running" },
      { type: "step", step: "cv", status: "done", removed: 1 },
    ]);
    const headers = (vi.mocked(fetch).mock.calls[0][1]?.headers ?? {}) as Record<string, string>;
    expect(headers.accept).toBe(KIT_STREAM);
  });

  it("throws the error line as the route's own error", async () => {
    respond([line({ type: "step", step: "cv", status: "running" }), line({ type: "error", status: 502, error: "model_quota", message: "Free limit." })]);
    const e = await apiStream("/api/kit", {}, () => {}, { timeoutMs: 0, ai: { provider: "demo" } }).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ code: "model_quota", status: 502, kind: "model", message: "Free limit." });
  });

  it("treats a stream that ends without an answer as a lost connection, which the queue waits out", async () => {
    respond([line({ type: "step", step: "cv", status: "running" })]);
    await expect(apiStream("/api/kit", {}, () => {}, { timeoutMs: 0, ai: { provider: "demo" } })).rejects.toMatchObject({ kind: "network" });
  });

  it("reads a refusal before the stream (rate limit) as JSON, as before", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "rate_limited", message: "Hourly limit." }, { status: 429, headers: { "retry-after": "60" } })));
    await expect(apiStream("/api/kit", {}, () => {}, { timeoutMs: 0, ai: { provider: "demo" } })).rejects.toMatchObject({ kind: "rate_limited", retryAfter: 60 });
  });
});
