import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { answersPrompt, cardPrompt, cvPrompt, extractPrompt, fitPrompt, letterPrompt } from "@/lib/ai/prompts";
import { tidyFacts, type Extracted } from "@/lib/ai/schema";
import { composeCv } from "@/lib/cv/compose";
import type { CvBody, Fit } from "@/lib/cv/schema";
import { aoife, rahul } from "@/lib/demo/personas";
import type { ScoredJob } from "@/lib/jobs/types";
import type { Fact } from "@/lib/profile/types";

// The prompts are short because e4b reads every word; these tests pin the rules that
// matter, so a later edit can't quietly drop one.

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
});
afterAll(() => vi.useRealTimers());

const job = (description: string) => ({ id: "j1", title: "Graduate Software Engineer", company: "Cisco", location: "Galway", city: "Galway", description }) as unknown as ScoredJob;
const long = job("We build collaboration software. ".repeat(60));
const short = job("Graduate Software Engineer in Galway. Python and React.");
const fit: Fit = {
  verdict: "good",
  requirements: [
    { need: "React", match: "strong", facts: ["ab5"], note: "" },
    { need: "Kubernetes", match: "gap", facts: [], note: "" },
  ],
  angle: "Lead with your Harbour Payments internship.",
};

describe("prompts", () => {
  it("CV: a full summary ending in a career objective, 7 competencies, richer bullets and a graduate's tense", () => {
    const p = cvPrompt(long, fit, aoife.facts, aoife.neverClaim);
    expect(p).toContain("- profile: the professional summary, 4 or 5 sentences");
    expect(p).toContain('- aim: the career objective, one sentence that closes the summary. It names "Graduate Software Engineer"');
    expect(p).toContain("- competencies: exactly 7 if the facts allow");
    expect(p).toContain("A bullet may join 2 or 3 facts from the same employer");
    expect(p).toContain("a shorter true CV beats padding");
    expect(p).toContain("Never add led, managed, presented");
    expect(p).toContain("Each fact appears once across roles and projects.");
    expect(p).toContain('Fact ids go only in the "facts" lists');
    expect(p).toContain("they are a graduate, not a student");
    expect(p).toContain("Never claim: any certification.");
  });

  it("CV: one page asks for less of every section, and achievements are only the ones no job owns", () => {
    const p = cvPrompt(long, fit, aoife.facts, aoife.neverClaim, undefined, "short");
    expect(p).toContain("Write a one-page CV");
    expect(p).toContain("It must fit on one A4 page");
    expect(p).toContain("- competencies: exactly 4,");
    expect(p).not.toContain("two A4 pages");
    // ab5 to ab7 belong to Harbour Payments and ab9 to Kiln Coffee: they are bullets, not achievements.
    expect(cvPrompt(long, fit, aoife.facts, []).match(/achievement facts \(([^)]*)\)/)?.[1]).toBe("ab3");
  });

  it("CV retry quotes the rules that removed lines", () => {
    const p = cvPrompt(long, fit, aoife.facts, [], { parts: ["profile"], rules: ["uncited", "unsupported_tool"] });
    expect(p).toContain("uncited: every line cites the ids of the facts it uses; unsupported_tool: only tools named in the cited facts");
    expect(p).toContain("Write only profile again");
  });

  it("fit: strict definitions, and a short posting is labelled as a summary", () => {
    expect(fitPrompt(long, aoife.facts)).toContain("strong: a cited fact names this skill, tool, degree or task.");
    expect(fitPrompt(long, aoife.facts)).toContain("Never infer one from the job title.");
    expect(fitPrompt(long, aoife.facts)).not.toContain("short summary");
    expect(fitPrompt(short, aoife.facts, ["fluent German"])).toContain("This posting is a short summary");
    expect(fitPrompt(short, aoife.facts, ["fluent German"])).toContain("Never claim: fluent German.");
  });

  it("card: three lines, never-claim passed, no score", () => {
    const p = cardPrompt(long, aoife.facts, ["any certification"]);
    expect(p).toContain("Never claim: any certification.");
    expect(p).not.toMatch(/score/i);
  });

  it("letter: the Quick lane looks forward; only the Careful lane names confirmed gaps", () => {
    const quick = letterPrompt(long, fit, aoife.facts, aoife.header, { lane: "quick" });
    expect(quick).toContain("One forward-looking sentence");
    expect(quick).not.toContain("Kubernetes");
    const careful = letterPrompt(long, fit, aoife.facts, aoife.header, { lane: "careful" });
    expect(careful).toContain("I haven't … yet");
    expect(careful).toContain("Kubernetes");
    expect(careful).toContain("link one thing this posting names");
  });

  it("answers: code owns the questions, and no scaffolding reaches the model's answer", () => {
    const p = answersPrompt(long, aoife.facts);
    expect(p).toContain('why_company: "Why do you want to work at Cisco?"');
    expect(p).not.toContain("needsYou");
    expect(p).not.toMatch(/salary/i);
  });
});

// A made-up CV in the shape Irish graduates send (no real person: example.ie, a placeholder number).
const SAMPLE_CV = `SEÁN Ó MURCHÚ
Cork | sean.omurchu@example.ie | +353 87 000 0000 | linkedin.com/in/example-sean

PROFILE
Recent Commerce graduate with hands-on accounts experience, looking for a graduate finance role in Cork or Dublin.

EDUCATION
University College Cork, Bachelor of Commerce (International), Second Class Honours Grade 1 (2.1)    Sept 2021 – May 2025
Relevant modules: Corporate Finance (A1), Financial Accounting, Business Analytics
Final year dissertation: "Remote work and Cork commercial property rents", graded 72%
Leaving Certificate, Coláiste Chríost Rí, 2021: 533 points

EXPERIENCE
Finance Intern, Brennan & Walsh Accountants, Cork    Jun 2024 – Aug 2024
• Reconciled 120+ supplier accounts monthly in Xero and flagged €14,000 of duplicate invoices
• Built an Excel model that cut month-end close preparation from 3 days to 2

Sales Assistant (part-time), Dunnes Stores, Douglas    Sept 2021 – May 2024
• Trained 5 new starters on till procedures

SKILLS
Excel (pivot tables, VLOOKUP, Power Query), Xero, Sage, basic Python, SQL
Languages: English (native), Irish (fluent), Spanish (B2)

CERTIFICATIONS
Bloomberg Market Concepts (2023)`;

// What the import model returned for it: dates as written on the CV, languages in its own style.
const extracted: Extracted["facts"] = [
  { kind: "education", text: "Bachelor of Commerce (International), University College Cork", org: "University College Cork", start: "Sept 2021", end: "May 2025" },
  { kind: "achievement", text: "Second Class Honours Grade 1 (2.1)", org: "University College Cork" },
  { kind: "other", text: "Relevant modules: Corporate Finance (A1), Financial Accounting, Business Analytics", org: "University College Cork" },
  { kind: "education", text: "Leaving Certificate, Coláiste Chríost Rí: 533 points", org: "Coláiste Chríost Rí", start: null, end: "2021" },
  { kind: "role", text: "Finance Intern", org: "Brennan & Walsh Accountants", title: "Finance Intern", where: "Cork", start: "Jun 2024", end: "Aug 2024" },
  { kind: "achievement", text: "Reconciled 120+ supplier accounts monthly in Xero and flagged €14,000 of duplicate invoices", org: "Brennan & Walsh Accountants" },
  { kind: "achievement", text: "Built an Excel model that cut month-end close preparation from 3 days to 2", org: "Brennan & Walsh Accountants" },
  { kind: "role", text: "Sales Assistant (part-time)", org: "Dunnes Stores", title: "Sales Assistant", where: "Douglas", start: "Sept 2021", end: "05/2024" },
  { kind: "achievement", text: "Trained 5 new starters on till procedures", org: "Dunnes Stores" },
  { kind: "skill", text: "Excel (pivot tables, VLOOKUP, Power Query), Xero, Sage, basic Python, SQL" },
  { kind: "language", text: "Irish: Fluent" },
  { kind: "language", text: "Spanish - B2" },
  { kind: "certification", text: "Bloomberg Market Concepts (2023)", start: "2023" },
];

describe("import of a CV", () => {
  it("asks for skills as written and languages like Irish (fluent)", () => {
    const p = extractPrompt("cv", SAMPLE_CV);
    expect(p).toContain("533 points");
    expect(p).toContain('write it like "Irish (fluent)"');
    expect(p).toContain("where is the town or city");
  });

  const facts: Fact[] = tidyFacts(extracted).map((f, i) => ({ ...f, id: `s${i + 1}`, source: "cv", confirmed: true, createdAt: "2026-10-16T00:00:00Z" }));

  it("turns month names into dates code can sort", () => {
    expect(facts.find((f) => f.kind === "role" && f.org === "Dunnes Stores")).toMatchObject({ start: "2021-09", end: "2024-05" });
    expect(facts[0]).toMatchObject({ start: "2021-09", end: "2025-05" });
    expect(facts.filter((f) => f.kind === "language").map((f) => f.text)).toEqual(["Irish (fluent)", "Spanish (B2)"]);
  });

  it("composes the finance CV: degree and grade on top, the internship above part-time work, the certificate kept", () => {
    const finance: Fit = { verdict: "good", requirements: [{ need: "Xero and month-end close", match: "strong", facts: ["s6", "s7"], note: "" }], angle: "" };
    const body: CvBody = { objective: [], summary: [{ text: "Commerce graduate.", facts: ["s1"] }], competencies: [], roles: [], projects: [], achievements: [], skills: [] };
    const cv = composeCv({ header: { name: "Seán Ó Murchú", links: [] }, facts }, body, finance, new Date("2026-10-16T12:00:00Z"));
    expect(cv.education.map((e) => e.text)[0]).toBe("Bachelor of Commerce (International), University College Cork");
    expect(cv.education[0].lines?.map((l) => l.text)).toEqual(["Second Class Honours Grade 1 (2.1)", "Relevant modules: Corporate Finance (A1), Financial Accounting, Business Analytics"]);
    expect(cv.experience.map((r) => r.title)).toEqual(["Finance Intern", "Sales Assistant (part-time)"]);
    expect(cv.certifications?.map((c) => c.text)).toEqual(["Bloomberg Market Concepts (2023)"]);
    expect(cv.skills).toEqual(["Excel (pivot tables, VLOOKUP, Power Query)", "Xero", "Sage", "basic Python", "SQL"]);
  });
});

it("Rahul's MSc ended in 2025: the CV prompt calls him a graduate", () => {
  expect(cvPrompt(long, fit, rahul.facts, [])).toContain("Latest degree: MSc Data Analytics, University of Galway, finished: they are a graduate");
});
