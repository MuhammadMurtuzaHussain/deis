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
        objective: [],
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
      "Led an initiative, using data to optimise the program centre.",
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

describe("guard refinements from the first live runs", () => {
  it("keeps verbs grammatical when replacing buzzwords", () => {
    expect(houseStyle("Skilled in utilizing Python and leveraging SQL")).toBe("Skilled in using Python and using SQL");
    expect(houseStyle("Spearheading the rollout")).toBe("Leading the rollout");
  });

  it("drops 'currently studying' for a degree that has ended", () => {
    const done = ledger([fact("m1", "education", "MSc Data Analytics, University of Galway", { start: "2024", end: "2025" })], []);
    expect(whyNot("Currently pursuing an MSc in Data Analytics", ["m1"], done, { now: new Date("2026-10-13") })).toBe("past_as_present");
    const going = ledger([fact("m2", "education", "BSc Data Science, UCC", { start: "2022", end: "2027" })], []);
    expect(whyNot("Currently studying Data Science", ["m2"], going, { now: new Date("2026-10-13") })).toBeNull();
  });

  it("lets a letter quote the posting's dates and admit a tool gap, but not claim the tool", () => {
    const posting = "A 6 month placement starting January 2027. You know Java.";
    expect(whyNot("I would love to join the 2027 placement.", [], l, { requireFacts: false, cv: false, posting })).toBeNull();
    expect(whyNot("I haven't used Java professionally yet, but I learn fast.", [], l, { requireFacts: false, cv: false, posting })).toBeNull();
    expect(whyNot("I am proficient in Java.", [], l, { requireFacts: false, cv: false, posting })).toBe("unsupported_tool");
    expect(whyNot("Joining the 2027 placement.", ["a1"], l, { posting })).toBe("unsupported_number");
  });
});

import { cleanId, clip } from "@/lib/cv/guard";
describe("model output tolerance", () => {
  it("finds the id when a model copies the whole fact line", () => {
    expect(cleanId("[rm1] (education · University of Galway · 2024 to 2025) MSc Data Analytics")).toBe("rm1");
    expect(cleanId("rm11")).toBe("rm11");
    expect(cleanId("ab5 (achievement)")).toBe("ab5");
  });
  it("trims long text at a sentence or word", () => {
    expect(clip("First sentence here. Second one is long and goes on", 30)).toBe("First sentence here.");
    expect(clip("short", 30)).toBe("short");
  });
});

import { keepSentences, splitSentences } from "@/lib/cv/guard";
describe("sentence-level guarding", () => {
  const done = ledger(
    [
      fact("m1", "education", "MSc Data Analytics, University of Galway", { start: "2024", end: "2025" }),
      fact("m2", "achievement", "Built Power BI dashboards for 5 regional managers", { org: "Lantern" }),
    ],
    [],
  );
  it("drops only the sentence that fails", () => {
    const events: { rule: string; text: string }[] = [];
    const out = keepSentences("Currently undertaking an MSc in Data Analytics [m1]. Built Power BI dashboards for 5 regional managers [m2].", ["m1", "m2"], done, events as never, { now: new Date("2026-10-13") });
    expect(out).toBe("Built Power BI dashboards for 5 regional managers.");
    expect(events.map((e) => e.rule)).toEqual(["past_as_present"]);
  });
  it("never lets a model claim a visa or right-to-work status", () => {
    expect(whyNot("I am eligible to work in Ireland without sponsorship.", [], done, { requireFacts: false, cv: false })).toBe("work_status");
    expect(whyNot("I hold a Stamp 1G.", [], done, { requireFacts: false, cv: false })).toBe("work_status");
  });
  it("splits sentences without breaking decimals", () => {
    expect(splitSentences("Raised it to 3.5 points. Then left!")).toEqual(["Raised it to 3.5 points.", "Then left!"]);
  });
  it("strips markdown from labels", () => {
    expect(houseStyle("**Data analysis**")).toBe("Data analysis");
  });
});

describe("guard tolerance from the Careful-lane run", () => {
  it("reads skills the model cited inline", () => {
    const { body } = guardCv({ objective: [], summary: [{ text: "Graduate.", facts: ["e1"] }], competencies: [], roles: [], projects: [], achievements: [], skills: ["Python [s1]", "SQL [s1]"] }, l);
    expect(body.skills).toEqual(["Python", "SQL"]);
  });
  it("ignores an invented id when a real one backs the line", () => {
    const events: never[] = [];
    expect(keepSentences("Cleaned sales data for 40 stores using Python and Pandas.", ["zz9", "a2"], l, events)).toBe("Cleaned sales data for 40 stores using Python and Pandas.");
    expect(keepSentences("Cleaned sales data for 40 stores.", ["zz9"], l, events)).toBeNull();
  });
});

import { inlineIds } from "@/lib/cv/guard";
describe("citations in round brackets", () => {
  it("strips and reads (ab5) style ids", () => {
    expect(stripCitations("Built a dashboard in React (ab5).")).toBe("Built a dashboard in React.");
    expect(stripCitations("Wrote SQL (ab6, ab7) weekly")).toBe("Wrote SQL weekly");
    expect(stripCitations("Raised coverage (from 41%)")).toBe("Raised coverage (from 41%)");
    expect(inlineIds("Dashboards (ab5) and SQL [ab6, ab7]")).toEqual(["ab5", "ab6", "ab7"]);
  });
});

import { bareIds } from "@/lib/cv/guard";
describe("citations with no brackets", () => {
  it("strips real fact ids and leaves look-alikes", () => {
    expect(stripCitations("Cleaned sales data in Python a2, s1, a1", l)).toBe("Cleaned sales data in Python");
    expect(stripCitations("Built dashboards a1 and a2.", l)).toBe("Built dashboards.");
    expect(stripCitations("Python a2 and SQL s1 every week", l)).toBe("Python and SQL every week");
    expect(stripCitations("Led the Q3 review at B2 level", l)).toBe("Led the Q3 review at B2 level");
    expect(stripCitations("Cleaned sales data a2")).toBe("Cleaned sales data a2");
    expect(bareIds("Python a2, SQL s1, Q3 and u1", l)).toEqual(["a2", "s1"]);
  });
});

import { newFactId } from "@/lib/profile/types";
describe("ids in odd shapes", () => {
  it("reads ids however the model wrote them", () => {
    expect(cleanId("RM1")).toBe("rm1");
    expect(cleanId("fact rm11")).toBe("rm11");
    expect(cleanId("id: ab5")).toBe("ab5");
    expect(cleanId("(ab5)")).toBe("ab5");
    const id = newFactId();
    expect(cleanId(`[${id}] (achievement) Built a thing`)).toBe(id);
  });
});

import { resolveCitations } from "@/lib/cv/guard";
describe("citation repair", () => {
  it("maps a quoted fact or a kind-and-employer label to real facts", () => {
    expect(resolveCitations(["Built Power BI dashboards that cut weekly reporting from 6 hours to 2"], l)).toEqual(["a1"]);
    expect(resolveCitations(["achievement · Kerry Group"], l)).toEqual(["a1", "a2"]);
    expect(resolveCitations(["[a1]", "nonsense"], l)).toEqual(["a1"]);
    expect(resolveCitations(["Led a team of 50 engineers"], l)).toEqual([]);
  });
});

describe("career objective", () => {
  it("may quote the posting's numbers; the rest of the CV may not", () => {
    const { body, events } = guardCv(
      {
        objective: [{ text: "Seeks a place on the Finance Graduate Programme 2027, bringing Power BI reporting.", facts: ["a1"] }],
        summary: [{ text: "Joins the 2027 intake with Power BI reporting.", facts: ["a1"] }],
        competencies: [],
        roles: [],
        projects: [],
        achievements: [],
        skills: [],
      },
      l,
      "Finance Graduate Programme 2027",
    );
    expect(body.objective).toHaveLength(1);
    expect(body.summary).toHaveLength(0);
    expect(events.map((e) => e.rule)).toEqual(["unsupported_number"]);
  });
});

describe("ids written into a CV line", () => {
  it("count as its citation when the list is empty", () => {
    const { body, events } = guardCv(
      { objective: [], summary: [{ text: "Data science graduate of University College Cork (e1).", facts: [] }], competencies: [{ label: "Reporting", text: "Power BI dashboards a1", facts: [] }], roles: [], projects: [], achievements: [], skills: [] },
      l,
    );
    expect(body.summary).toEqual([{ text: "Data science graduate of University College Cork.", facts: ["e1"] }]);
    expect(body.competencies[0]).toMatchObject({ text: "Power BI dashboards", facts: ["a1"] });
    expect(events).toEqual([]);
  });
});

// ---- Live failures from the 15-16 Oct audit (gemma4:e4b and gemma4:12b kits for Aoife and Rahul)

import { guardLetter as letterGuard, whyNotLine, spellNumbers, type GuardEvent, type GuardRepair } from "@/lib/cv/guard";
import { isFinished } from "@/lib/profile/dates";
import { aoife, rahul } from "@/lib/demo/personas";

const oct15 = new Date("2026-10-15T12:00:00Z");
const la = ledger(aoife.facts, aoife.neverClaim);
const lr = ledger(rahul.facts, rahul.neverClaim);
const cisco =
  "Coding skills in some or all of C++/Qt/Java/JavaScript/Python. Why Cisco? We're revolutionizing how data and infrastructure connect and protect organizations in the AI era. We've been innovating fearlessly for 40 years to create solutions that power how humans and technology work together across the physical and digital worlds.";
const arup =
  "Arup is seeking graduates for its advisory team in Ireland who will translate investments in assets, people and infrastructure into valuable outcomes. The role combines strategy with analytics to inform major infrastructure projects through data-driven insights. You will work across data governance, policy development and client-facing workshops. A 2 year graduate programme starting in September 2027, in a team of 300 people.";

describe("isFinished (OQ-1)", () => {
  it("counts a bare year as finished from July, and a month once it has passed", () => {
    expect(isFinished({ end: "2026" }, oct15)).toBe(true);
    expect(isFinished({ end: "2026" }, new Date("2026-06-15"))).toBe(false);
    expect(isFinished({ end: "2026-05" }, oct15)).toBe(true);
    expect(isFinished({ end: "2026-10" }, oct15)).toBe(false);
    expect(isFinished({ end: "Jun 2026" }, oct15)).toBe(true);
    expect(isFinished({ end: "2027" }, oct15)).toBe(false);
  });
  it("treats no end, Present or Current as still going", () => {
    for (const end of [undefined, null, "", "Present", "current", "present"]) expect(isFinished({ end }, oct15)).toBe(false);
  });
});

describe("tense on a 2026 graduate, checked on every sentence (OQ-1)", () => {
  it("drops the e4b summary and letter lines that made Aoife a current student", () => {
    expect(whyNot("Final year student pursuing a BSc in Computer Science at University College Dublin.", ["ab1"], la, { now: oct15 })).toBe("past_as_present");
    expect(
      whyNot("My academic foundation in Computer Science from University College Dublin is preparing me to think across technology boundaries and develop sophisticated products.", ["ab1"], la, { cv: false, now: oct15 }),
    ).toBe("past_as_present");
    // Even when the sentence cites no education fact at all.
    expect(whyNot("Currently studying while building dashboards.", ["ab5"], la, { now: oct15 })).toBe("past_as_present");
    expect(whyNot("Expected to graduate in 2026.", ["ab1"], la, { now: oct15 })).toBe("past_as_present");
  });
  it("still lets a past project and a real student through", () => {
    expect(whyNot("Final-year project graded first class.", ["ab3"], la, { now: oct15 })).toBeNull();
    expect(whyNot("Final year student pursuing a BSc in Computer Science.", ["ab1"], la, { now: new Date("2026-03-01") })).toBeNull();
  });
  it("reads past narratives, future plans and professional exams as fine", () => {
    expect(whyNot("In my final year I built a timetable app for Dublin Bus.", ["ab2"], la, { cv: false, now: oct15 })).toBeNull();
    expect(whyNot("I am interested in pursuing a master's degree later.", [], la, { requireFacts: false, cv: false, now: oct15 })).toBeNull();
    expect(whyNot("I am currently studying for professional accounting exams.", [], la, { requireFacts: false, cv: false, now: oct15 })).toBeNull();
  });
});

describe("citation repair and honest gaps (OQ-5)", () => {
  it("keeps Rahul's under-cited answer by adding the same-employer fact, and logs the repair", () => {
    const events: GuardEvent[] = [];
    const repairs: GuardRepair[] = [];
    const text =
      "My experience includes using Python, SQL, and Power BI to analyse data for real-world applications, such as improving delivery time insights and automating reporting processes.";
    expect(keepSentences(text, ["rm1", "rm2", "rm5", "rm6"], lr, events, { requireFacts: false, cv: false, posting: arup }, repairs)).toBe(text);
    expect(events).toEqual([]);
    expect(repairs).toEqual([{ rule: "cite_repaired", text, ids: ["rm7"] }]);
  });
  it("never repairs from another employer", () => {
    const events: GuardEvent[] = [];
    expect(keepSentences("Built Power BI dashboards and handled stock counts on 20-hour weekly shifts.", ["rm5"], lr, events)).toBeNull();
    expect(events.map((e) => e.rule)).toEqual(["unsupported_number"]);
  });
  it("keeps Aoife's honest gap sentence that the old guard dropped", () => {
    const { letter, events } = letterGuard(
      {
        paragraphs: [
          { text: "I am interested in the Graduate Software Engineer role at Cisco.", facts: [] },
          {
            text: "While my background is strong in Python, TypeScript, and React, I have limited professional experience specifically with C++/Qt/Java environments mentioned. I look forward to discussing how I can contribute.",
            facts: ["ab11"],
          },
        ],
      },
      la,
      cisco,
      oct15,
    );
    expect(events).toEqual([]);
    expect(letter.paragraphs[1].text).toMatch(/^While my background/);
  });
  it("strips a dangling 'However,' when the sentence it answered is gone", () => {
    const events: GuardEvent[] = [];
    expect(keepSentences("I lead the Kubernetes platform team. However, I built an internal dashboard in TypeScript and React.", ["ab5"], la, events, { cv: false })).toBe(
      "I built an internal dashboard in TypeScript and React.",
    );
    expect(events.map((e) => e.rule)).toEqual(["unsupported_tool"]);
  });
});

describe("number words (OQ-6)", () => {
  it("reads spelled-out numbers and checks them like digits", () => {
    expect(spellNumbers("Trained twelve new staff over twenty-five shifts")).toBe("Trained 12 new staff over 25 shifts");
    expect(spellNumbers("one of the first")).toBe("one of the first");
    expect(whyNot("Trained twelve new staff on the till", ["ab9"], la)).toBe("unsupported_number");
    expect(whyNot("Trained four new staff on the till and opening checklist.", ["ab9"], la)).toBeNull();
  });
  it("treats doubled and halved as claims the facts must make", () => {
    expect(whyNot("Doubled unit test coverage on the refunds service.", ["ab7"], la)).toBe("unsupported_number");
    expect(whyNot("Halved weekly reporting time with Power BI dashboards.", ["a1"], l)).toBe("unsupported_number");
  });
});

describe("skills are whole words, tools and certificates included (OQ-9)", () => {
  const sk = ledger([fact("k1", "skill", "JavaScript, R, Excel"), fact("k2", "achievement", "Built trust with 40 store managers")], []);
  it("doesn't pass Java via JavaScript, Rust via trust, or short skills the profile lacks", () => {
    const { body, events } = guardCv({ objective: [], summary: [], competencies: [], roles: [], projects: [], achievements: [], skills: ["Java", "Rust", "Go", "R", "JavaScript", "Excel"] }, sk);
    expect(body.skills).toEqual(["R", "JavaScript", "Excel"]);
    expect(events.map((e) => e.text)).toEqual(["Java", "Rust", "Go"]);
  });
  it("needs a tool's full name, not its words scattered across facts", () => {
    const scattered = ledger([fact("k3", "skill", "Python, Power Query"), fact("k4", "achievement", "Won the BI hackathon")], []);
    const { body } = guardCv({ objective: [], summary: [], competencies: [], roles: [], projects: [], achievements: [], skills: ["Power BI", "Python"] }, scattered);
    expect(body.skills).toEqual(["Python"]);
  });
});

describe("letters and answers cite their claims (OQ-13)", () => {
  it("leaves only the opener and the close uncited", () => {
    const { letter, events } = guardLetter(
      {
        paragraphs: [
          { text: "I would like to join the advisory team at Arup.", facts: [] },
          { text: "I am an expert in machine learning and stakeholder engagement.", facts: [] },
          { text: "At Lantern Logistics I built Power BI dashboards on delivery times for 5 regional managers.", facts: ["rm5"] },
          { text: "I look forward to hearing from you.", facts: [] },
        ],
      },
      lr,
      arup,
    );
    expect(letter.paragraphs.map((p) => p.text)).toEqual([
      "I would like to join the advisory team at Arup.",
      "At Lantern Logistics I built Power BI dashboards on delivery times for 5 regional managers.",
      "I look forward to hearing from you.",
    ]);
    expect(events.map((e) => e.rule)).toEqual(["uncited"]);
  });
  it("still counts the close as the close when a sign-off follows it", () => {
    // Live, 16 Oct (Rahul, Pinterest): the close was dropped as a middle paragraph.
    const close = "I look forward to applying my technical background to developing large scale ML systems at Pinterest. I welcome the opportunity to discuss how my skills match this internship.";
    const { letter, events } = guardLetter(
      {
        paragraphs: [
          { text: "I would like to apply for the internship at Pinterest.", facts: [] },
          { text: "At Lantern Logistics I built Power BI dashboards on delivery times for 5 regional managers.", facts: ["rm5"] },
          { text: close, facts: [] },
          { text: "Thank you for your time. Kind regards, Rahul Menon", facts: [] },
        ],
      },
      lr,
      arup,
    );
    expect(events).toEqual([]);
    expect(letter.paragraphs.map((p) => p.text)).toContain(close);
    // A sign-off doesn't excuse an uncited claim in the paragraph before the close.
    const claim = guardLetter(
      { paragraphs: [{ text: "Hello.", facts: [] }, { text: "I have managed large teams.", facts: [] }, { text: "I look forward to hearing from you.", facts: [] }, { text: "Kind regards, Rahul", facts: [] }] },
      lr,
    );
    expect(claim.events.map((e) => e.rule)).toEqual(["uncited"]);
  });
  it("keeps honest gap lines and interest in the employer from the 16 Oct eval, and still drops tool claims", () => {
    const mongo = "Join MongoDB as a graduate engineer in Dublin. MongoDB is the developer data platform. At MongoDB you will build with Java and Hadoop.";
    const rules = (t: string) =>
      guardLetter(
        {
          paragraphs: [
            { text: "I would like to apply for the graduate role.", facts: [] },
            { text: `At Lantern Logistics I built Power BI dashboards on delivery times for 5 regional managers. ${t}`, facts: ["rm5"] },
            { text: "I look forward to hearing from you.", facts: [] },
          ],
        },
        lr,
        mongo,
      ).events.map((e) => e.rule);
    expect(rules("I look forward to learning new technologies like Java and C#.")).toEqual([]);
    expect(rules("I haven't gained experience with big data technologies like Hadoop.")).toEqual([]);
    expect(rules("I am interested in MongoDB because it builds tools for developers.")).toEqual([]);
    expect(rules("I have used Hadoop at scale.")).toEqual(["unsupported_tool"]);
    expect(rules("I have experience in MongoDB.")).toEqual(["unsupported_tool"]);
  });
  it("drops uncited claims inside an answer but keeps what it says about the employer", () => {
    const { answers, events } = guardAnswers(
      {
        answers: [
          {
            question: "Why do you want to work here?",
            answer: "Your work on major infrastructure appeals to me. I have managed complex stakeholder projects for years.",
            facts: [],
            needsYou: false,
          },
        ],
      },
      lr,
      arup,
    );
    expect(answers.answers[0].answer).toBe("Your work on major infrastructure appeals to me.");
    expect(events.map((e) => e.rule)).toEqual(["uncited"]);
  });
});

describe("work status means visas, not society sponsors (OQ-19)", () => {
  const soc = ledger([fact("t1", "leadership", "Treasurer of the UCC Finance Society, securing 3 corporate sponsors and a corporate sponsor for the hackathon", { org: "UCC Finance Society" })], []);
  it("keeps sponsor lines and still drops status claims", () => {
    expect(whyNot("Secured a corporate sponsor for the hackathon.", ["t1"], soc)).toBeNull();
    expect(whyNot("Treasurer securing 3 corporate sponsors.", ["t1"], soc)).toBeNull();
    expect(whyNot("I will not need sponsorship to work in Ireland.", [], soc, { requireFacts: false, cv: false })).toBe("work_status");
    expect(whyNot("I do not require visa sponsorship.", [], soc, { requireFacts: false, cv: false })).toBe("work_status");
    expect(whyNot("Built a checkout that takes Visa and Mastercard.", ["t1"], soc)).not.toBe("work_status");
  });
});

describe("tools in any case, and tools the list doesn't know (OQ-X1)", () => {
  it("catches the tools the old list let through", () => {
    for (const tool of ["Git", "GitHub", "Swift", "Firebase", "Jest", "Selenium", "VBA", "SAS", "Canva", "WordPress", "kubernetes"]) {
      expect(whyNot(`Built the society website with ${tool}.`, ["a3"], l)).toBe("unsupported_tool");
    }
  });
  it("finds unknown tools by their shape, but not degrees, plurals or names", () => {
    expect(whyNot("Trained models in LightGBM and PyTorch.", ["a2"], l)).toBe("unsupported_tool");
    expect(whyNot("Shipped a Vue.js front end.", ["a2"], l)).toBe("unsupported_tool");
    expect(whyNot("Managed a €12,000 society budget during the BSc, reporting to the KPIs and CVs team.", ["a3"], l)).toBeNull();
  });
  it("leaves everyday words alone: excel at, react to", () => {
    expect(whyNot("Cleaned sales data for 40 stores and learned to react to feedback and excel at detail.", ["a2"], l)).toBeNull();
  });
  it("lets a letter name the employer when its name is a tool", () => {
    // The posting talks about its employer by name, as real ones do.
    const posting = "About MongoDB: MongoDB is redefining the data platform. Interns at MongoDB work on MongoDB Atlas.";
    expect(whyNot("I would love to join MongoDB as an intern.", [], la, { requireFacts: false, cv: false, posting })).toBeNull();
    expect(whyNot("I have used MongoDB daily.", [], la, { requireFacts: false, cv: false, posting })).toBe("unsupported_tool");
    expect(whyNot("MongoDB is building the data platform for the AI era, and I am keen to bring my skills to MongoDB.", [], la, { requireFacts: false, cv: false, posting })).toBeNull();
    expect(whyNot("I have experience with MongoDB.", [], la, { requireFacts: false, cv: false, posting })).toBe("unsupported_tool");
    // The objective names the role as advertised, tool and number included.
    const stripe = "Workday at Stripe: our Workday team runs Workday for every Stripe.";
    expect(whyNot("To contribute to the Workday Analyst role at Stripe, applying data skills.", ["ab1"], la, { posting: stripe, quotesPosting: true })).toBeNull();
    // Names the list doesn't know work the same way: the employer yes, a claim to use its tools no.
    const abbvie = "About AbbVie: AbbVie is hiring graduate analysts at AbbVie Sligo to work with LightGBM models.";
    expect(whyNot("I would like to work at AbbVie because my background is in data.", ["ab1"], la, { cv: false, posting: abbvie })).toBeNull();
    expect(whyNot("I have used LightGBM in my projects.", ["ab2"], la, { cv: false, posting: abbvie })).toBe("unsupported_tool");
  });
});

describe("posting numbers and negations in letters (OQ-X2)", () => {
  const opts = { requireFacts: false, cv: false, posting: arup };
  it("allows the posting's years and durations only", () => {
    expect(whyNot("I would value starting the 2 year graduate programme in September 2027.", [], lr, opts)).toBeNull();
    expect(whyNot("I would like to join your team of 300 people.", [], lr, opts)).toBe("unsupported_number");
  });
  it("needs negation near the tool, and not a boast", () => {
    expect(whyNot("Java is a language I have not used yet.", [], lr, opts)).toBeNull();
    expect(whyNot("I have not only used Python but also Java.", [], lr, opts)).toBe("unsupported_tool");
    expect(whyNot("I would have no trouble working in Java.", [], lr, opts)).toBe("unsupported_tool");
    expect(whyNot("Not every role suits me, but I know Kafka and Java well from long hours of study and practice.", [], lr, opts)).toBe("unsupported_tool");
    // A bare "not" after a tool doesn't excuse it: Kafka is still claimed here.
    expect(whyNot("I used Kafka, not RabbitMQ.", [], lr, opts)).toBe("unsupported_tool");
  });
});

describe("Roman numerals aren't first person (OQ-X3)", () => {
  it("reads Calculus I and Grade I as numerals", () => {
    const m = ledger([fact("c1", "education", "BSc Mathematics, modules: Calculus I and Financial Accounting I, Grade I piano", { org: "UCC", end: "2025" })], []);
    expect(whyNot("Modules included Calculus I, Financial Accounting I and Grade I piano.", ["c1"], m, { now: oct15 })).toBeNull();
    expect(whyNot("I completed Calculus I.", ["c1"], m, { now: oct15 })).toBe("first_person");
  });
});

describe("added claims: led, managed, presented (OQ-10)", () => {
  it("drops the live drifts", () => {
    expect(whyNot("Stakeholder communication: Developed and presented Power BI dashboards on delivery times to support 5 regional managers.", ["rm5"], lr)).toBe("added_claim");
    expect(whyNot("Managed stock counts and resolved customer queries during 20-hour weekly shifts.", ["rm9"], lr)).toBe("added_claim");
    expect(
      whyNot("However, my technical skills in SQL, Python, and Power BI, combined with my experience presenting data to managers, will allow me to learn your specific governance protocols quickly.", ["rm11"], lr, { cv: false }),
    ).toBe("added_claim");
    expect(whyNot("Professionally, I gained practical experience building client-facing tools.", ["ab4", "ab5", "ab7"], la, { cv: false })).toBe("added_claim");
    expect(whyNot("My experience leading study groups as a class representative will help.", ["rm10"], lr, { cv: false })).toBe("added_claim");
  });
  it("reads findings presented via dashboards as the dashboards' work, not a talk", () => {
    // Live fit note, 16 Oct (Rahul, Pinterest).
    expect(whyNotLine("Presenting findings via Power BI dashboards and automating reporting shows strong communication.", ["rm5", "rm6"], lr, "note")).toBeNull();
    expect(whyNotLine("Presented findings to the board in a weekly meeting.", ["rm5"], lr, "note")).toBe("added_claim");
  });
  it("keeps the verbs the facts use, and causal or company senses", () => {
    expect(whyNot("Managed a €12,000 society budget.", ["a3"], l)).toBeNull();
    expect(whyNot("Led 12 workshops in one year for 30 to 80 students each.", ["ab10"], la)).toBeNull();
    expect(whyNot("Built Power BI dashboards that led to faster weekly reporting, from 6 hours to 2.", ["a1"], l)).toBeNull();
    expect(whyNot("Handled customer queries in a customer-facing role.", ["rm9"], lr)).toBeNull();
    expect(whyNot("Built Power BI dashboards on delivery times for 5 regional managers at one of Ireland's leading hauliers.", ["rm5"], lr)).toBeNull();
    expect(whyNot("Arup leads major infrastructure projects across Ireland.", ["rm5"], lr, { cv: false })).toBeNull();
  });
});

describe("posting copy (OQ-11)", () => {
  it("drops letter and answer sentences that repeat 7 or more words of the posting", () => {
    expect(whyNot("I am eager to translate investments in assets, people and infrastructure into valuable outcomes within an advisory team setting.", [], lr, { requireFacts: false, cv: false, posting: arup })).toBe(
      "posting_copy",
    );
    expect(
      whyNot("The chance to contribute to software that shapes how humans and technology work together across physical and digital worlds is very appealing.", [], la, { requireFacts: false, cv: false, posting: cisco }),
    ).toBe("posting_copy");
    expect(whyNot("Arup's infrastructure work is why I am applying.", [], lr, { requireFacts: false, cv: false, posting: arup })).toBeNull();
  });
});

describe("card lines, fit notes and the angle (whyNotLine)", () => {
  it("checks each kind of line by its own rules", () => {
    expect(whyNotLine("Built and enhanced software using React and TypeScript at Harbour Payments.", ["ab5"], la, "strong")).toBeNull();
    expect(whyNotLine("No specific evidence of experience with C++, Qt, or Java programming languages.", [], la, "gap", cisco)).toBeNull();
    expect(whyNotLine("You have experience presenting dashboards to regional managers.", ["rm5"], lr, "note")).toBe("added_claim");
    expect(whyNotLine("Lead with your MSc in Data Analytics and your Power BI dashboards.", [], lr, "angle")).toBeNull();
    expect(whyNotLine("Lead with your Kubernetes work.", [], lr, "angle")).toBe("unsupported_tool");
    expect(whyNotLine("Strong Python with 3 years of experience.", ["rm11"], lr, "transferable")).toBe("never_claim");
    expect(whyNotLine("Built dashboards.", [], lr, "strong")).toBe("uncited");
  });
});

describe("source tags the model copied from the prompt (OQ-2)", () => {
  it("removes [posting] and (facts) tokens", () => {
    expect(stripCitations("Shapes how humans and technology work together [posting].")).toBe("Shapes how humans and technology work together.");
    expect(stripCitations("Align with the required coding skills (posting) and [job posting].")).toBe("Align with the required coding skills and.");
  });
});

// ---- Review of the phase 1 guard (16 Oct): ways a claim still got past it

describe("plans to learn don't excuse a tool already claimed (R1, G2)", () => {
  const mongo = "Join MongoDB as a graduate engineer in Dublin. MongoDB is the developer data platform. At MongoDB you will build with Java and Hadoop.";
  const rules = (t: string) =>
    letterGuard(
      {
        paragraphs: [
          { text: "I would like to apply for the graduate role.", facts: [] },
          { text: `At Lantern Logistics I built Power BI dashboards on delivery times for 5 regional managers. ${t}`, facts: ["rm5"] },
          { text: "I look forward to hearing from you.", facts: [] },
        ],
      },
      lr,
      mongo,
    ).events.map((e) => e.rule);
  it("drops a claim with forward-looking words after it", () => {
    for (const t of [
      "I have used Hadoop at scale and look forward to learning more.",
      "I used Java daily and I am keen to learn more.",
      "I built Java services and I'm keen to develop further.",
      "I have experience in MongoDB and look forward to learning about your platform.",
      "I have used Hadoop at scale, and I want to grow with your team.",
      "I have deployed Kubernetes in production, and I'm keen to grow further.",
      "I want to build on my Kafka and Databricks experience in this role.",
      "I hope to grow the Snowflake skills I used at Lantern Logistics.",
      "I couldn't have delivered our reporting without Kafka.",
      "I'm not new to Kafka either.",
      "Never a day passed without Snowflake at Lantern Logistics.",
    ])
      expect(rules(t), t).toEqual(["unsupported_tool"]);
  });
  it("still keeps honest plans and gaps", () => {
    for (const t of ["I am keen to learn Kafka and Hadoop.", "I haven't used Kafka yet, but I am keen to learn it.", "I am currently learning Kafka.", "I used Python daily and Kafka is new to me."]) expect(rules(t), t).toEqual([]);
  });
});

describe("a close doesn't excuse a claim made before it (R2)", () => {
  const close = (t: string) => guardLetter({ paragraphs: [{ text: "Hello.", facts: [] }, { text: t, facts: [] }] }, lr).events.map((e) => e.rule);
  it("drops what the user says they did, unless it's what they offer to discuss", () => {
    expect(close("I have managed large teams and look forward to discussing how I can help.")).toEqual(["uncited"]);
    expect(close("I led a team of engineers, which I look forward to discussing.")).toEqual(["uncited"]);
    expect(close("I look forward to discussing how I built my dashboards.")).toEqual([]);
  });
});

describe("work status, whichever way round (G1)", () => {
  const o = { requireFacts: false, cv: false };
  it("drops status claims HEAD caught and the ones it missed", () => {
    for (const t of [
      "Sponsorship is not required for this role.",
      "Sponsorship is not something I need.",
      "Happy to note that sponsorship won't be needed.",
      "On the Critical Skills list, I built Power BI dashboards.",
      "I have no immigration constraints.",
      "I hold full working rights in Ireland.",
      "Irish passport holder.",
      "Work authorisation in place.",
      "Legally able to work in Ireland.",
      "I can start without a permit.",
    ])
      expect(whyNot(t, [], lr, o), t).toBe("work_status");
  });
  it("keeps society sponsors, critical skills as a phrase and immigration law", () => {
    for (const t of ["Secured event sponsorship for the hackathon.", "Developed critical skills in SQL and Python.", "Researched immigration law for a class project."]) expect(whyNot(t, ["rm11"], lr, o), t).not.toBe("work_status");
  });
});

describe("citation repair borrows one fact, never a verb (G3)", () => {
  const kg = ledger(
    [
      fact("r1", "role", "Data Analyst Intern", { org: "Kerry Group", title: "Data Analyst Intern", start: "2025-06", end: "2025-09" }),
      fact("a1", "achievement", "Built Power BI dashboards that cut weekly reporting from 6 hours to 2", { org: "Kerry Group" }),
      fact("a2", "achievement", "Cleaned sales data for 40 stores using Python and Pandas", { org: "Kerry Group" }),
      fact("a5", "achievement", "Shadowed the team lead on a Kafka migration", { org: "Kerry Group" }),
      fact("a6", "achievement", "Ran the monthly stock count and answered 2 supplier queries", { org: "Kerry Group" }),
    ],
    [],
  );
  it("won't build a claim out of several facts", () => {
    const bullets = [
      { text: "Led a team of 40 on the Kafka migration", facts: ["a1"] },
      { text: "Managed 2 Kafka clusters for 40 stores", facts: ["a1"] },
    ];
    const { body, events, repairs } = guardCv({ objective: [], summary: [], competencies: [], roles: [{ org: "Kerry Group", bullets }], projects: [], achievements: [], skills: [] }, kg);
    expect(body.roles[0].bullets).toEqual([]);
    expect(events).toHaveLength(2);
    expect(repairs).toEqual([]);
  });
  it("doesn't read someone else's title as the user's", () => {
    expect(whyNot("Led the Kafka migration at Kerry Group.", ["a5"], kg)).toBe("added_claim");
    expect(whyNot("Managed delivery dashboards for regional managers.", ["rm5"], lr)).toBe("added_claim");
  });
  it("never repairs an added claim (the ESB letter)", () => {
    const events: GuardEvent[] = [];
    const repairs: GuardRepair[] = [];
    const text = "I achieved this while also managing duties at Corrib Grocers, handling stock counts on 20-hour shifts.";
    expect(keepSentences(text, ["rm4", "rm6", "rm7", "rm9"], lr, events, { cv: false }, repairs)).toBeNull();
    expect(events.map((e) => e.rule)).toEqual(["added_claim"]);
    expect(repairs).toEqual([]);
  });
});

describe("a finished degree written as current (G4)", () => {
  const two = ledger(
    [
      fact("e1", "education", "BSc Data Science, University College Cork", { org: "University College Cork", start: "2022", end: "2025-05" }),
      fact("e2", "education", "MSc Data Analytics, University of Galway", { org: "University of Galway", start: "2025", end: "present" }),
    ],
    [],
  );
  it("checks the degree the sentence is about, even when another is ongoing", () => {
    expect(whyNot("Currently pursuing a BSc in Data Science.", ["e1"], two, { now: oct15 })).toBe("past_as_present");
    expect(whyNot("Currently pursuing an MSc in Data Analytics.", ["e2"], two, { now: oct15 })).toBeNull();
    expect(whyNot("My BSc and current MSc have taught me to clean data.", ["e1", "e2"], two, { cv: false, now: oct15 })).toBeNull();
  });
  it("catches the phrasings the after-e4b kits kept", () => {
    const o = { cv: false, now: oct15 };
    expect(whyNot("My BTech in Information Technology and current MSc in Data Analytics have equipped me to clean data.", ["rm1", "rm2"], lr, o)).toBe("past_as_present");
    expect(whyNot("My current studies in MSc Data Analytics are deepening my understanding.", ["rm1"], lr, o)).toBe("past_as_present");
    for (const t of ["Final year Data Science student", "Currently in final year of MSc Data Analytics", "Studying for an MSc in Data Analytics", "MSc Data Analytics student due to finish this year"])
      expect(whyNot(t, ["rm1"], lr, { now: oct15 }), t).toBe("past_as_present");
  });
});

describe("numbers in words and other scripts, and first person (G5)", () => {
  it("checks scale words, full-width digits and a year of experience", () => {
    for (const t of ["Trained two hundred staff on Python reports", "Automated reports for thousands of stores using Python", "Automated a weekly Excel report with Python for ４０ stores", "Automated a weekly Excel report with Python for ٤٠ stores"])
      expect(whyNot(t, ["rm6"], lr), t).toBe("unsupported_number");
    expect(whyNot("Over a year of experience automating Excel reports with Python", ["rm6"], lr)).toBe("years_claim");
  });
  it("needs a CV line's own facts to name an unlisted tool, and reads Me as first person", () => {
    expect(whyNot("Built tableau dashboards with Python", ["rm6"], lr)).toBe("unsupported_tool");
    expect(whyNot("Me and the team automated a weekly Excel report with Python", ["rm6"], lr)).toBe("first_person");
  });
});
