import { describe, expect, it } from "vitest";
import { failedParts, groupEvents, lineMarkers, mergeRewrite, numberFacts, tracedLines, usage, withFitEvents } from "../src/components/application/trace";
import { cvSections, type CvDocument } from "../src/lib/cv/compose";
import type { Kit } from "../src/lib/client/db";

// The kit workspace's pure helpers: fact numbering for the trace rail, checks grouping and
// keeping the old kit's parts when a rewrite fails on them.

const cv: CvDocument = {
  header: { name: "Aoife Byrne", email: null, phone: null, location: "Galway", links: [] },
  profile: [
    { text: "Data graduate.", facts: ["ed1", "p1"] },
    { text: "Built a dashboard.", facts: ["p1"] },
  ],
  educationFirst: true,
  length: "short",
  education: [{ text: "BSc Data Science, University of Galway", dates: "2021 – 2025", facts: ["ed1"], lines: [{ text: "First class honours", facts: ["g1"] }] }],
  experience: [{ title: "Barista", org: "Coffee Co", where: null, dates: "2023 – 2024", bullets: [{ text: "Served 200 customers a day", facts: ["r1", "a1"] }] }],
  projects: [{ text: "Dashboard for bus delays", facts: ["p1"] }],
  skills: ["SQL"],
};

const kit = (over: Partial<Kit> = {}): Kit => ({ cv, letter: null, answers: null, events: [], usage: { inputTokens: 1, outputTokens: 1, ms: 1000 }, model: "gemma", at: 1, ...over });

describe("trace numbering", () => {
  it("numbers facts by first use, in page order, skipping code-owned headings", () => {
    const lines = tracedLines(cvSections(cv));
    // Profile first, then the degree's own line (not the degree heading), then the job bullet.
    expect([...numberFacts(lines).entries()]).toEqual([
      ["ed1", 1],
      ["p1", 2],
      ["g1", 3],
      ["r1", 4],
      ["a1", 5],
    ]);
  });

  it("drops facts that no longer exist, so no marker points at nothing", () => {
    const n = numberFacts([{ facts: ["gone", "x"] }, { facts: ["y"] }], (id) => id !== "gone");
    expect([...n.keys()]).toEqual(["x", "y"]);
    expect(n.get("x")).toBe(1);
  });

  it("counts the lines each fact is used in, once per line", () => {
    const u = usage([{ facts: ["a", "a", "b"] }, { facts: ["a"] }]);
    expect(u.get("a")).toBe(2);
    expect(u.get("b")).toBe(1);
  });

  it("orders a line's markers by number and drops unknown ids", () => {
    const n = new Map([
      ["a", 2],
      ["b", 1],
    ]);
    expect(lineMarkers(["a", "zz", "b", "a"], n)).toEqual(["b", "a"]);
  });
});

describe("checks", () => {
  it("groups events by rule, most common first", () => {
    const g = groupEvents([
      { rule: "uncited", text: "a" },
      { rule: "years_claim", text: "b" },
      { rule: "years_claim", text: "c" },
    ]);
    expect(g.map((x) => [x.rule, x.items.length])).toEqual([
      ["years_claim", 2],
      ["uncited", 1],
    ]);
  });

  it("reads failed parts from the server's error lines", () => {
    expect(failedParts(["letter: timed out", "answers: bad json", "letter: again"])).toEqual(["letter", "answers"]);
    expect(failedParts(undefined)).toEqual([]);
  });
});

describe("rewriting a kit", () => {
  const letter = { paragraphs: [{ text: "Old letter.", facts: [] }] };

  it("keeps the old letter when the rewrite failed on it", () => {
    const next = kit({ at: 2, errors: ["letter: timed out"] });
    const out = mergeRewrite(kit({ letter }), next);
    expect(out.letter).toBe(letter);
    expect(out.errors).toEqual([]);
    expect(out.at).toBe(2);
  });

  it("reports the failure when there was nothing to keep", () => {
    const out = mergeRewrite(kit(), kit({ errors: ["letter: timed out"] }));
    expect(out.letter).toBeNull();
    expect(out.errors).toEqual(["letter: timed out"]);
  });

  it("takes the new parts when the rewrite worked", () => {
    const fresh = { paragraphs: [{ text: "New letter.", facts: [] }] };
    expect(mergeRewrite(kit({ letter }), kit({ letter: fresh })).letter).toBe(fresh);
  });

  it("swaps the old fit events for the new ones", () => {
    const old = [{ rule: "fit_demoted" as const, text: "old" }];
    const k = kit({ events: [...old, { rule: "uncited", text: "cv line" }] });
    expect(withFitEvents(k, old, []).events).toEqual([{ rule: "uncited", text: "cv line" }]);
  });
});
