import { afterEach, describe, expect, it, vi } from "vitest";
import { composeCv, type CvDocument } from "@/lib/cv/compose";
import { GUARD_VERSION, type CvBody } from "@/lib/cv/schema";
import { aoife } from "@/lib/demo/personas";
import { kitScoringEnabled } from "@/mastra/observability";
import { scoreKit, type KitScoreInput } from "@/mastra/scorers";
import type { Kit } from "@/mastra/workflows/kit";

// The kit scorers are the offline eval's checks, run on every hosted kit. Fixed kits,
// no model. Their reasons leave the server, so they hold rule names and counts only.

const NOW = new Date("2026-10-16T12:00:00Z");
const body = (b: Partial<CvBody>): CvBody => ({ objective: [], summary: [], competencies: [], roles: [], projects: [], achievements: [], skills: [], ...b });
const job = { title: "Graduate Software Engineer", company: "Cisco", description: "Build collaboration software in Python and React. A 2 year programme starting in 2027." };
const input: KitScoreInput = { job, facts: aoife.facts };
const usage = { inputTokens: 0, outputTokens: 0, ms: 0 };
const kitOf = (k: Partial<Kit>): Kit => ({ cv: null, letter: null, answers: null, events: [], repairs: [], usage, errors: [], guardVersion: GUARD_VERSION, ...k });

const cleanKit = kitOf({
  cv: composeCv(
    aoife,
    body({
      summary: [{ text: "Computer science graduate who builds React dashboards.", facts: ["ab1", "ab5"] }],
      roles: [
        { org: "Harbour Payments", bullets: [{ text: "Built a TypeScript and React dashboard for support agents.", facts: ["ab5"] }, { text: "Raised refunds test coverage from 41% to 68%.", facts: ["ab7"] }] },
        { org: "Kiln Coffee", bullets: [{ text: "Trained 4 new staff on the till.", facts: ["ab9"] }] },
      ],
    }),
    undefined,
    NOW,
  ),
  letter: { paragraphs: [{ text: "I built a React dashboard at Harbour Payments. Your 2 year programme starting in 2027 suits me.", facts: ["ab5"] }] },
  answers: { answers: [{ question: "Why Cisco?", answer: "I enjoy building tools people use every day.", facts: ["ab5"], needsYou: false }] },
});

/** compose drops near-copies itself, so one is added to the finished CV, as a model slip past it would look. */
const withNearCopy = (cv: CvDocument): CvDocument => ({
  ...cv,
  experience: cv.experience.map((r, i) => (i === 0 ? { ...r, bullets: [...r.bullets, { text: `${r.bullets[0].text.replace(/\.$/, "")} for the team.`, facts: r.bullets[0].facts }] } : r)),
});

const dirtyKit = kitOf({
  cv: withNearCopy(composeCv(
    aoife,
    body({
      summary: [{ text: "Final-year student who deployed Kubernetes clusters.", facts: ["ab1"] }],
      roles: [
        {
          org: "Harbour Payments",
          bullets: [
            { text: "Built a TypeScript and React dashboard for support agents.", facts: ["ab5"] },
            { text: "Cut refund errors by 37% with AWS Lambda.", facts: ["ab6"] },
          ],
        },
      ],
    }),
    undefined,
    NOW,
  )),
  letter: { paragraphs: [{ text: "I am currently studying for my degree [ab1]. I have used Terraform for 57 years.", facts: ["ab1"] }] },
  answers: { answers: [{ question: "Why Cisco?", answer: "needsYou", facts: [], needsYou: true }] },
  events: [
    { rule: "uncited", text: "Led a team of 9 engineers at Google." },
    { rule: "unsupported_tool", text: "Shipped services on Azure." },
    { rule: "uncited", text: "Won a hackathon." },
  ],
});

const byId = (scores: Awaited<ReturnType<typeof scoreKit>>) => Object.fromEntries(scores.map((s) => [s.scorerId, s]));

describe("kit scorers", () => {
  it("score a clean kit 1 on every check, with nothing removed", async () => {
    const s = byId(await scoreKit(input, cleanKit));
    expect(Object.keys(s).sort()).toEqual([
      "kit-finished-degree-as-current",
      "kit-guard-removed",
      "kit-near-copies",
      "kit-prompt-leaks",
      "kit-untraceable-answers",
      "kit-untraceable-cv",
      "kit-untraceable-letter",
    ]);
    for (const id of ["kit-untraceable-cv", "kit-untraceable-letter", "kit-untraceable-answers", "kit-near-copies", "kit-finished-degree-as-current", "kit-prompt-leaks"]) expect(s[id].score).toBe(1);
    expect(s["kit-untraceable-cv"].reason).toBe("0 untraceable items in the CV");
    // The letter quotes the posting's own "2 year programme starting in 2027", which is allowed.
    expect(s["kit-untraceable-letter"].reason).toBe("0 untraceable items in the letter");
    expect(s["kit-guard-removed"]).toMatchObject({ score: 0, reason: expect.stringMatching(/^removed 0 of \d+ sentences$/) });
  });

  it("count each problem in a dirty kit, by kind and rule", async () => {
    const s = byId(await scoreKit(input, dirtyKit));
    expect(s["kit-untraceable-cv"]).toEqual({ scorerId: "kit-untraceable-cv", scorerName: "kit-untraceable-cv", score: 0.25, reason: "3 untraceable items in the CV: tool 2, number 1" });
    expect(s["kit-untraceable-letter"]).toMatchObject({ score: 0.333, reason: "2 untraceable items in the letter: number 1, tool 1" });
    expect(s["kit-near-copies"]).toMatchObject({ score: 0.5, reason: "1 near-copy pair among 7 lines" });
    expect(s["kit-finished-degree-as-current"]).toMatchObject({ score: 0.333, reason: "2 phrases writing a finished degree as current" });
    expect(s["kit-prompt-leaks"]).toMatchObject({ score: 0.333, reason: "2 leaks: brackets 1, field name 1" });
    expect(s["kit-guard-removed"].reason).toMatch(/^removed 3 of \d+ sentences: uncited 2, unsupported_tool 1$/);
    expect(s["kit-guard-removed"].score).toBeGreaterThan(0);
  });

  it("never put kit, posting or fact text in a reason", async () => {
    const reasons = [...(await scoreKit(input, dirtyKit)), ...(await scoreKit(input, cleanKit))].map((s) => s.reason).join("\n");
    expect(reasons).not.toMatch(/Kubernetes|AWS|Lambda|Terraform|37|Harbour|Cisco|Google|Azure|hackathon|ab1|currently|studying|dashboard|Aoife|Dublin/i);
  });

  it("leave out what a kit doesn't have, and the tense check when a degree is ongoing", async () => {
    const studying: KitScoreInput = { job, facts: aoife.facts.map((f) => (f.kind === "education" ? { ...f, end: "2027" } : f)) };
    const ids = (await scoreKit(studying, kitOf({ cv: cleanKit.cv }))).map((s) => s.scorerId);
    expect(ids).not.toContain("kit-untraceable-letter");
    expect(ids).not.toContain("kit-untraceable-answers");
    expect(ids).not.toContain("kit-finished-degree-as-current");
    expect(ids).toContain("kit-untraceable-cv");
    expect(await scoreKit(input, kitOf({}))).toEqual([]);
  });

  it("only read the kit", async () => {
    const before = structuredClone(dirtyKit);
    await scoreKit(input, dirtyKit);
    expect(dirtyKit).toEqual(before);
  });

  it("only count confirmed facts as sources", async () => {
    const unconfirmed: KitScoreInput = { job, facts: aoife.facts.map((f) => (f.id === "ab7" ? { ...f, confirmed: false } : f)) };
    const s = byId(await scoreKit(unconfirmed, cleanKit));
    expect(s["kit-untraceable-cv"].reason).toBe("2 untraceable items in the CV: number 2");
  });
});

describe("kit scoring switch", () => {
  afterEach(() => vi.unstubAllEnvs());
  const keys = { MASTRA_PLATFORM_ACCESS_TOKEN: "t", MASTRA_PROJECT_ID: "p" };

  it("follows tracing: hosted on, desktop only with diagnostics, never offline", () => {
    expect(kitScoringEnabled({})).toBe(false);
    expect(kitScoringEnabled({ ...keys, DEIS_HOSTED: "1" })).toBe(true);
    expect(kitScoringEnabled({ ...keys, DEIS_DESKTOP: "1" })).toBe(false);
    expect(kitScoringEnabled({ ...keys, DEIS_DESKTOP: "1", DEIS_DIAGNOSTICS: "1" })).toBe(true);
    vi.stubEnv("DEIS_OFFLINE", "1");
    expect(kitScoringEnabled(keys)).toBe(false);
  });
});
