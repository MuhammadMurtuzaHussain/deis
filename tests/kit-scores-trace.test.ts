import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Mastra } from "@mastra/core/mastra";
import type { ObservabilityExporter, ScoreEvent, TracingEvent } from "@mastra/core/observability";
import { RequestContext } from "@mastra/core/request-context";
import { MockLanguageModelV3 } from "ai/test";
import { aoife } from "@/lib/demo/personas";
import type { ScoredJob } from "@/lib/jobs/types";
import type { ModelChain } from "@/mastra/model";
import { agents } from "@/mastra/agents";
import { observability } from "@/mastra/observability";
import { kitWorkflow, type Kit } from "@/mastra/workflows/kit";

// A traced kit run, as on the hosted demo: the checks step sends one score per kit
// scorer onto the workflow run's trace, and neither the scores nor the spans carry
// a word of the CV, the posting or the facts.

const job = { id: "j1", title: "Graduate Software Engineer", company: "Cisco", location: "Galway", city: "Galway", description: "Build collaboration software in Python and React." } as unknown as ScoredJob;
const fit = { verdict: "good" as const, requirements: [{ need: "Testing", match: "strong" as const, facts: ["ab7"], note: "" }], angle: "" };
const replies: Record<string, string> = {
  cv: JSON.stringify({
    profile: [{ text: "Computer science graduate who raised unit-test coverage on a refunds service from 41% to 68%.", facts: ["ab1", "ab7"] }],
    roles: [{ org: "Harbour Payments", bullets: [{ text: "Raised unit-test coverage on the refunds service from 41% to 68%.", facts: ["ab7"] }, { text: "Led 40 engineers at Harbour Payments.", facts: ["ab7"] }] }],
  }),
  letter: JSON.stringify({ paragraphs: [{ text: "I raised test coverage from 41% to 68% at Harbour Payments.", facts: ["ab7"] }] }),
  answers: JSON.stringify({ why_company: { answer: "I built a React dashboard for support agents.", facts: ["ab5"] }, why_fit: { answer: "", facts: [] }, proud_of: { answer: "", facts: [] } }),
};
const which = (p: string) => (p.includes("Write a full CV") || p.includes("A checker removed lines") ? "cv" : p.includes("cover letter body") ? "letter" : "answers");
const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
const model = new MockLanguageModelV3({
  doGenerate: async (o) => ({ content: [{ type: "text", text: replies[which(JSON.stringify(o.prompt))] }], finishReason: { unified: "stop", raw: "stop" }, usage, warnings: [] }),
});
const chain = { tier: "local", label: "mock", models: [{ id: "mock", model, maxRetries: 0 }] } as unknown as ModelChain;

// The agents reach Mastra through src/mastra/index; here that is this test's instance, so nothing goes to Mastra Platform.
let testMastra: Mastra;
vi.mock("@/mastra/index", () => ({
  get mastra() {
    return testMastra;
  },
}));

const scores: ScoreEvent[] = [];
const spans: TracingEvent[] = [];
const capture: ObservabilityExporter = {
  name: "capture",
  exportTracingEvent: async (e) => void spans.push(e),
  onScoreEvent: async (e) => void scores.push(e),
  flush: async () => {},
  shutdown: async () => {},
};

describe("kit scores on a trace", () => {
  beforeAll(() => {
    vi.stubEnv("MASTRA_PLATFORM_ACCESS_TOKEN", "t");
    vi.stubEnv("MASTRA_PROJECT_ID", "p");
    vi.stubEnv("DEIS_HOSTED", "1");
  });
  afterAll(() => vi.unstubAllEnvs());

  it("sends one score per scorer for the workflow run, with rule names and counts only", async () => {
    testMastra = new Mastra({ agents, workflows: { kitWorkflow }, observability: observability([capture]), logger: false });
    const run = await testMastra.getWorkflow("kitWorkflow").createRun();
    const out = await run.start({ inputData: { job, profile: aoife, fit, include: { letter: true, answers: true } }, requestContext: new RequestContext([["chain", chain]]) });
    expect(out.status).toBe("success");
    const kit = (out as { result: Kit }).result;
    expect(kit.cv).not.toBeNull();
    await vi.waitFor(() => expect(scores.length).toBeGreaterThanOrEqual(7));

    const runSpan = spans.find((e) => e.exportedSpan.type === "workflow_run")!.exportedSpan;
    expect(new Set(scores.map((s) => s.score.traceId))).toEqual(new Set([runSpan.traceId]));
    expect(new Set(scores.map((s) => s.score.spanId))).toEqual(new Set([runSpan.id]));
    expect(scores.map((s) => s.score.scorerId).sort()).toEqual([
      "kit-finished-degree-as-current",
      "kit-guard-removed",
      "kit-near-copies",
      "kit-prompt-leaks",
      "kit-untraceable-answers",
      "kit-untraceable-cv",
      "kit-untraceable-letter",
    ]);
    const removed = scores.find((s) => s.score.scorerId === "kit-guard-removed")!.score;
    expect(removed.reason).toMatch(/^removed [1-9]\d* of \d+ sentences: /);
    expect(spans.some((e) => e.exportedSpan.name === "workflow step: 'checks'")).toBe(true);

    const sent = JSON.stringify({ scores, spans });
    expect(sent).not.toMatch(/Aoife|Harbour|refunds|coverage|Cisco|Graduate Software|dashboard|aoife\.byrne/i);
  });
});
