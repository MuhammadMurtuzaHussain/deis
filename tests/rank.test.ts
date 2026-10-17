import { describe, expect, it } from "vitest";
import { buildDeck, profileTerms } from "@/lib/jobs/rank";
import { score } from "@/lib/jobs/normalise";
import { aoife, rahul } from "@/lib/demo/personas";
import type { Job } from "@/lib/jobs/types";
import { STAGE_LABEL, STAGES, yearsReach } from "@/lib/profile/types";

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

import { HIDDEN_COPY } from "@/lib/jobs/rank";

describe("stage and stretch (PRD-X1, PRD-X2)", () => {
  const intern = job("Software Engineering Intern 2027 (Dublin)", "This position requires current enrollment in a school. Python, React, TypeScript.");
  const grad = job("Graduate Software Engineer", "Python, React, TypeScript, SQL. Recent graduates welcome.");
  const twoYears = job("Software Engineer", "At least two years' experience in a similar role. Python.");

  it("hides student-only internships from a graduate, with its own reason", () => {
    const deck = buildDeck([intern, grad], aoife.preferences, aoife.facts, new Set());
    expect(deck.entries.map((e) => e.job.title)).toEqual(["Graduate Software Engineer"]);
    expect(deck.hidden.student).toBe(1);
  });
  it("puts them first for someone still studying", () => {
    const deck = buildDeck([grad, intern], { ...aoife.preferences, stage: "student" }, aoife.facts, new Set());
    expect(deck.entries[0].job.title).toBe("Software Engineering Intern 2027 (Dublin)");
    expect(deck.hidden.student).toBe(0);
  });
  it("reads the flag again for jobs cached before it existed", () => {
    const old = { ...intern, seniority: { ...intern.seniority, studentOnly: undefined } };
    expect(buildDeck([old], aoife.preferences, aoife.facts, new Set()).hidden.student).toBe(1);
  });
  it("counts 2-year roles apart from senior ones, and says so plainly", () => {
    const deck = buildDeck([twoYears, grad], aoife.preferences, aoife.facts, new Set());
    expect(deck.hidden.stretch).toBe(1);
    expect(deck.hidden.level).toBe(0);
    expect(HIDDEN_COPY.stretch(1)).not.toMatch(/3\+/);
    expect(HIDDEN_COPY.stretch(1)).toMatch(/about 2 years/);
  });
});

describe("5 to 7 years working", () => {
  const prefs = { ...aoife.preferences, stage: "experienced" as const, showStretch: false };
  const fiveYears = job("Senior Software Engineer", "5+ years of experience with Python and React.");
  const sevenYears = job("Software Engineer", "Minimum of 7 years' experience. Python.");
  const tenYears = job("Software Engineer", "At least 10 years of experience building distributed systems.");
  const twoYears = job("Software Engineer", "At least two years' experience in a similar role. Python.");
  const director = job("Director of Engineering", "Python. Lead the engineering organisation.");
  const grad = job("Graduate Software Engineer", "Python, React, TypeScript, SQL. Recent graduates welcome.");
  const intern = job("Software Engineering Intern 2027 (Dublin)", "This position requires current enrollment in a school. Python, React, TypeScript.");

  it("shows senior and stretch roles asking for up to 7 years, without the stretch switch", () => {
    const deck = buildDeck([fiveYears, sevenYears, twoYears, grad], prefs, aoife.facts, new Set());
    expect(deck.entries).toHaveLength(4);
    expect(deck.hidden.level + deck.hidden.stretch).toBe(0);
  });
  it("hides roles asking for more than 7 years, and executive titles, as out of reach", () => {
    const deck = buildDeck([tenYears, director, fiveYears], prefs, aoife.facts, new Set());
    expect(deck.entries.map((e) => e.job.title)).toEqual(["Senior Software Engineer"]);
    expect(deck.hidden.level).toBe(2);
    expect(deck.hidden.stretch).toBe(0);
  });
  it("puts roles at their level ahead of graduate schemes, and hides student-only ones", () => {
    const deck = buildDeck([grad, intern, fiveYears], prefs, aoife.facts, new Set());
    expect(deck.entries.map((e) => e.job.title)).toEqual(["Senior Software Engineer", "Graduate Software Engineer"]);
    expect(deck.hidden.student).toBe(1);
  });
  it("leaves the early-career deck as it was", () => {
    const deck = buildDeck([fiveYears, director, grad], aoife.preferences, aoife.facts, new Set());
    expect(deck.entries.map((e) => e.job.title)).toEqual(["Graduate Software Engineer"]);
  });
});

describe("from studying to 7 or more years", () => {
  const at = (stage: (typeof STAGES)[number]) => ({ ...aoife.preferences, stage, showStretch: false });
  const grad = job("Graduate Software Engineer", "Python, React, TypeScript, SQL. Recent graduates welcome.");
  const twoYears = job("Software Engineer", "At least two years' experience in a similar role. Python.");
  const fourYears = job("Software Engineer II", "4+ years of experience with Python.");
  const sixYears = job("Senior Software Engineer", "6+ years of experience with Python.");
  const tenYears = job("Staff Software Engineer", "10+ years of experience building distributed systems in Python.");
  const director = job("Director of Software Engineering", "Python. Lead the engineering organisation.");
  const all = [grad, twoYears, fourYears, sixYears, tenYears, director];
  const seen = (stage: (typeof STAGES)[number]) => buildDeck(all, at(stage), aoife.facts, new Set()).entries.map((e) => e.job.title).sort();

  it("widens the deck stage by stage", () => {
    expect(seen("graduate")).toEqual(["Graduate Software Engineer"]);
    expect(seen("mid")).toEqual(["Graduate Software Engineer", "Software Engineer", "Software Engineer II"]);
    expect(seen("experienced")).toEqual(["Graduate Software Engineer", "Senior Software Engineer", "Software Engineer", "Software Engineer II"]);
    expect(seen("seasoned")).toHaveLength(all.length);
  });
  it("gives every stage a label and only the 3 years and up a reach", () => {
    for (const s of STAGES) expect(STAGE_LABEL[s]).toBeTruthy();
    expect(STAGES.map((s) => yearsReach(s))).toEqual([undefined, undefined, undefined, 5, 7, Infinity]);
  });
});
