import { describe, expect, it } from "vitest";
import { guardAnswers, guardCv, guardFit, guardLetter, ledger, whyNot } from "@/lib/cv/guard";
import { houseStyle } from "@/lib/cv/style";
import type { Fact } from "@/lib/profile/types";

const at = "2026-10-13T00:00:00Z";
const fact = (id: string, kind: Fact["kind"], text: string, extra: Partial<Fact> = {}): Fact => ({
  id,
  kind,
  text,
  source: "demo",
  confirmed: true,
  createdAt: at,
  ...extra,
});

const facts: Fact[] = [
  fact("r1", "role", "Data Analyst Intern", { org: "Kerry Group", title: "Data Analyst Intern", start: "2025-06", end: "2025-09" }),
  fact("a1", "achievement", "Built Power BI dashboards that cut weekly reporting from 6 hours to 2", { org: "Kerry Group" }),
  fact("a2", "achievement", "Cleaned sales data for 40 stores using Python and Pandas", { org: "Kerry Group" }),
  fact("r2", "role", "Treasurer", { org: "UCC Computer Society", title: "Treasurer", start: "2024-09", end: "2025-05" }),
  fact("a3", "leadership", "Managed a €12,000 society budget", { org: "UCC Computer Society" }),
  fact("e1", "education", "BSc Data Science, University College Cork, 2022 to 2026", { org: "University College Cork" }),
  fact("s1", "skill", "SQL, Excel, Python"),
  fact("u1", "achievement", "Unconfirmed claim about leading a team of 50", { confirmed: false }),
];
const l = ledger(facts, ["fluent German"]);

describe("whyNot", () => {
  it("keeps a line whose numbers and tools are in the cited facts", () => {
    expect(whyNot("Built Power BI dashboards that cut weekly reporting from 6 hours to 2", ["a1"], l)).toBeNull();
  });

  it("drops uncited lines and lines citing unknown or unconfirmed facts", () => {
    expect(whyNot("Great team player", [], l)).toBe("uncited");
    expect(whyNot("Led a team of 50", ["u1"], l)).toBe("unknown_fact");
    expect(whyNot("Led a team", ["zzz"], l)).toBe("unknown_fact");
  });

  it("drops invented numbers, tools and certifications", () => {
    expect(whyNot("Cut weekly reporting by 80%", ["a1"], l)).toBe("unsupported_number");
    expect(whyNot("Built Tableau dashboards", ["a1"], l)).toBe("unsupported_tool");
    expect(whyNot("Cleaned sales data for 40 stores with Python, holding a PMP", ["a2"], l)).toBe("unsupported_cert");
  });

  it("never states a total years of experience", () => {
    expect(whyNot("Analyst with 2 years of experience in Python", ["a2"], l)).toBe("years_claim");
  });

  it("honours the never-claim list and keeps first person off the CV", () => {
    expect(whyNot("Fluent German speaker who cleaned sales data for 40 stores", ["a2"], l)).toBe("never_claim");
    expect(whyNot("I cleaned sales data for 40 stores", ["a2"], l)).toBe("first_person");
    expect(whyNot("I cleaned sales data for 40 stores", ["a2"], l, { cv: false })).toBeNull();
  });

  it("treats 12,000 and 12000 as the same number", () => {
    expect(whyNot("Managed a society budget of €12000", ["a3"], l)).toBeNull();
  });
});

describe("guardCv", () => {
  it("files bullets only under the employer their facts belong to, and reports every drop", () => {
    const { body, events } = guardCv(
      {
        summary: [
          { text: "Data science graduate who builds dashboards people use", facts: ["e1", "a1"] },
          { text: "Results-driven analyst with 3 years of experience", facts: ["a1"] },
        ],
        competencies: [{ label: "Reporting", text: "Power BI dashboards that cut weekly reporting from 6 hours to 2", facts: ["a1"] }],
        roles: [
          {
            org: "Kerry Group Ireland",
            bullets: [
              { text: "Cleaned sales data for 40 stores using Python and Pandas", facts: ["a2"] },
              { text: "Managed a €12,000 budget", facts: ["a3"] },
            ],
          },
          { org: "Google", bullets: [{ text: "Built search", facts: ["a1"] }] },
        ],
        projects: [],
        achievements: [],
        skills: ["Python", "SQL", "Kubernetes", "Power BI", "CISSP"],
      },
      l,
    );
    expect(body.summary.map((s) => s.text)).toEqual(["Data science graduate who builds dashboards people use"]);
    expect(body.roles).toHaveLength(1);
    expect(body.roles[0].org).toBe("Kerry Group");
    expect(body.roles[0].bullets.map((b) => b.facts)).toEqual([["a2"]]);
    expect(body.skills).toEqual(["Python", "SQL", "Power BI"]);
    expect(events.map((e) => e.rule).sort()).toEqual(["unsupported_skill", "unsupported_skill", "wrong_employer", "wrong_employer", "years_claim"].sort());
  });
});

describe("other guards", () => {
  it("lets a letter speak in first person but still not invent", () => {
    const { letter, events } = guardLetter(
      {
        paragraphs: [
          { text: "I would like to bring my reporting work to your analytics team.", facts: [] },
          { text: "At Kerry Group I cleaned sales data for 40 stores using Python.", facts: ["a2"] },
          { text: "I also hold a CFA and five years of experience.", facts: [] },
        ],
      },
      l,
    );
    expect(letter.paragraphs).toHaveLength(2);
    expect(events).toHaveLength(1);
  });

  it("blanks answers only the user can give, and answers that invent", () => {
    const { answers } = guardAnswers(
      {
        answers: [
          { question: "Salary expectations?", answer: "€45,000", facts: [], needsYou: true },
          { question: "Why us?", answer: "I have used Snowflake daily.", facts: [], needsYou: false },
        ],
      },
      l,
    );
    expect(answers.answers.every((a) => a.answer === "" && a.needsYou)).toBe(true);
  });

  it("demotes a 'strong' match with no real facts to a gap", () => {
    const { fit, events } = guardFit(
      { verdict: "good", angle: "Lead with the dashboards", requirements: [{ need: "Tableau", match: "strong", facts: ["nope"], note: "" }] },
      l,
    );
    expect(fit.requirements[0].match).toBe("gap");
    expect(events[0].rule).toBe("fit_demoted");
  });
});

describe("houseStyle", () => {
  it("writes plainly, in Irish and British spelling, without em dashes", () => {
    expect(houseStyle("Spearheaded a world-class initiative — utilizing data to optimize the program center!")).toBe(
      "Led an initiative, used data to optimise the program centre.",
    );
    expect(houseStyle("Analyzed behavior across 2024–2025")).toBe("Analysed behaviour across 2024–2025");
  });
});

describe("fact ids", () => {
  it("accepts ids the way models copy them from the prompt", () => {
    expect(whyNot("Built Power BI dashboards that cut weekly reporting from 6 hours to 2", ["[a1]"], l)).toBeNull();
  });
});

import { stripCitations } from "@/lib/cv/guard";
describe("stripCitations", () => {
  it("removes inline fact ids but not ordinary brackets", () => {
    expect(stripCitations("Raised coverage from 41% to 68% [ab7].")).toBe("Raised coverage from 41% to 68%.");
    expect(stripCitations("Used Python and SQL [ab2, ab6] daily")).toBe("Used Python and SQL daily");
    expect(stripCitations("Led the Q3 [internal] review")).toBe("Led the Q3 [internal] review");
  });
});
