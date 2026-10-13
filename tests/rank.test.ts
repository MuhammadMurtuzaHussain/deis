import { describe, expect, it } from "vitest";
import { buildDeck, profileTerms } from "@/lib/jobs/rank";
import { score } from "@/lib/jobs/normalise";
import { aoife, rahul } from "@/lib/demo/personas";
import type { Job } from "@/lib/jobs/types";

const job = (title: string, description: string, extra: Partial<Job> = {}) =>
  score(
    { id: title, source: "greenhouse", title, company: "Example", location: "Dublin", city: "Dublin", remote: false, postedAt: null, description, salary: null, apply: [], url: "https://example.ie/j", ...extra },
    [],
  );

describe("buildDeck", () => {
  const jobs = [
    job("Graduate Software Engineer", "Python, React, TypeScript, SQL. Recent graduates welcome."),
    job("Senior Software Engineer", "5+ years of experience."),
    job("Account Executive (DACH)", "Sell to German customers."),
    job("Software Engineer", "We are unable to offer visa sponsorship. Python."),
    job("Junior Data Analyst", "SQL and Power BI.", { city: "Galway", location: "Galway" }),
    job("Legal Counsel", "Contracts."),
    job("Junior Developer", "JavaScript.", { city: "Cork", location: "Cork" }),
  ];

  it("hides what the user can't or won't take, and says how many and why", () => {
    const deck = buildDeck(jobs, rahul.preferences, rahul.facts, new Set());
    const titles = deck.entries.map((e) => e.job.title);
    expect(titles).toContain("Junior Data Analyst");
    expect(titles).not.toContain("Senior Software Engineer");
    expect(titles).not.toContain("Account Executive (DACH)");
    expect(deck.hidden.level).toBe(1);
    expect(deck.hidden.language).toBe(1);
    expect(deck.hidden.role).toBeGreaterThanOrEqual(1);
  });

  it("ranks the closest early-career match first", () => {
    const deck = buildDeck(jobs, aoife.preferences, aoife.facts, new Set());
    expect(deck.entries[0].job.title).toBe("Graduate Software Engineer");
    expect(deck.entries[0].matched).toEqual(expect.arrayContaining(["python", "react", "typescript"]));
    expect(deck.entries.map((e) => e.job.title)).not.toContain("Junior Developer");
  });

  it("drops jobs already swiped", () => {
    const deck = buildDeck(jobs, aoife.preferences, aoife.facts, new Set(["Graduate Software Engineer"]));
    expect(deck.entries.map((e) => e.job.title)).not.toContain("Graduate Software Engineer");
    expect(deck.hidden.seen).toBe(1);
  });

  it("takes terms only from confirmed facts", () => {
    const terms = profileTerms([{ ...aoife.facts[0], text: "Kubernetes wizard", confirmed: false }]);
    expect(terms.has("kubernetes")).toBe(false);
  });
});
