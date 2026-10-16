import { describe, expect, it } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";
import { RequestContext } from "@mastra/core/request-context";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { composeCv, cvSections, cvText, employerWeights, jaccard, scrub, type CvDocument } from "@/lib/cv/compose";
import { cvDocx } from "@/lib/cv/docx";
import { guardCv, ledger } from "@/lib/cv/guard";
import { bodyFromDraft, GUARD_VERSION, type CvBody } from "@/lib/cv/schema";
import { aoife, rahul } from "@/lib/demo/personas";
import type { ScoredJob } from "@/lib/jobs/types";
import type { Fact } from "@/lib/profile/types";
import { mastra } from "@/mastra";
import type { ModelChain } from "@/mastra/model";
import { tidyLetter, type Kit } from "@/mastra/workflows/kit";

const NOW = new Date("2026-10-16T12:00:00Z");
const body = (b: Partial<CvBody>): CvBody => ({ objective: [], summary: [], competencies: [], roles: [], projects: [], achievements: [], skills: [], ...b });
const fact = (id: string, kind: Fact["kind"], text: string, extra: Partial<Fact> = {}): Fact => ({ id, kind, text, source: "demo", confirmed: true, createdAt: "2026-10-13T00:00:00Z", ...extra });

describe("composeCv: the graduate layout", () => {
  // Harbour Payments matches the posting's hard skills; the café only matches "teamwork", which doesn't count.
  const fit = {
    requirements: [
      { need: "React and TypeScript", match: "strong" as const, facts: ["ab5"], note: "" },
      { need: "Unit testing", match: "transferable" as const, facts: ["ab7"], note: "" },
      { need: "Teamwork and communication", match: "strong" as const, facts: ["ab9"], note: "" },
    ],
  };

  it("ranks employers by weighted hard-skill matches, then newest first (Aoife for Harbour Payments)", () => {
    expect(employerWeights(fit, aoife.facts).get("harbourpayments")).toBe(3);
    expect(employerWeights(fit, aoife.facts).get("kilncoffee")).toBeUndefined();
    const cv = composeCv(aoife, body({ summary: [{ text: "Computer science graduate.", facts: ["ab1"] }] }), fit, NOW);
    expect(cv.experience.map((r) => r.org)).toEqual(["Harbour Payments", "Kiln Coffee"]);
    // Without a posting, the newer job leads.
    expect(composeCv(aoife, body({}), undefined, NOW).experience[0].org).toBe("Kiln Coffee");
  });

  it("counts a must-have that mentions teamwork when it also names hard work", () => {
    const internship = {
      requirements: [
        { need: "Experience in collaborative coding projects (professional or academic)", match: "strong" as const, facts: ["ab4", "ab5"], note: "" },
        { need: "Clear written communication skills", match: "transferable" as const, facts: ["ab9"], note: "" },
      ],
    };
    expect(employerWeights(internship, aoife.facts).get("harbourpayments")).toBe(2);
    expect(employerWeights(internship, aoife.facts).get("kilncoffee")).toBeUndefined();
    expect(composeCv(aoife, body({}), internship, NOW).experience[0].org).toBe("Harbour Payments");
  });

  it("drops a bullet that only restates the job title", () => {
    const cv = composeCv(rahul, body({ roles: [{ org: "Corrib Grocers", bullets: [{ text: "Served as a Customer Assistant.", facts: ["rm8"] }, { text: "Handled stock counts and customer queries.", facts: ["rm9"] }] }] }), undefined, NOW);
    expect(cv.experience.find((r) => r.org === "Corrib Grocers")?.bullets.map((b) => b.facts)).toEqual([["rm9"]]);
  });

  it("puts education with its grade straight after the profile on a 2026 graduate's one-page CV", () => {
    const cv = composeCv(aoife, body({ summary: [{ text: "Computer science graduate.", facts: ["ab1"] }] }), fit, NOW, "short");
    expect(cv.educationFirst).toBe(true);
    expect(cv.education[0].lines?.map((l) => l.text)).toEqual(["Final-year project graded first class"]);
    expect(cvSections(cv).map((s) => s.id)).toEqual(["header", "profile", "education", "experience", "projects", "skills", "languages"]);
  });

  it("leads the two-page CV with experience and puts education after projects, even for a graduate", () => {
    const cv = composeCv(aoife, body({ summary: [{ text: "Computer science graduate.", facts: ["ab1"] }] }), fit, NOW);
    expect(cv.educationFirst).toBe(false);
    expect(cv.education[0].lines?.map((l) => l.text)).toEqual(["Final-year project graded first class"]);
    expect(cvSections(cv).map((s) => s.id)).toEqual(["header", "profile", "experience", "projects", "education", "skills", "languages"]);
  });

  it("moves education below experience on two-page kits saved before 17 Oct 2026", () => {
    const cv = { ...composeCv(aoife, body({}), fit, NOW), educationFirst: true, length: undefined };
    expect(cvSections(cv).map((s) => s.id).slice(1, 4)).toEqual(["profile", "experience", "projects"]);
  });

  it("keeps part-time in the job title", () => {
    const cv = composeCv(rahul, body({}), undefined, NOW);
    expect(cv.experience.map((r) => r.title)).toContain("Part-time Customer Assistant");
  });

  it("lets each fact appear once and drops near-copies", () => {
    const cv = composeCv(
      aoife,
      body({
        summary: [{ text: "Graduate.", facts: ["ab1"] }],
        roles: [
          {
            org: "Harbour Payments",
            bullets: [
              { text: "Developed an internal dashboard using TypeScript and React to support agents when looking up failed card payments.", facts: ["ab5"] },
              { text: "Built the support agents' dashboard in React.", facts: ["ab5"] },
            ],
          },
        ],
        projects: [{ text: "Built an internal dashboard for agents using TypeScript and React to facilitate lookups of failed card payments.", facts: ["ab2"] }],
      }),
      fit,
      NOW,
    );
    expect(cv.experience[0].bullets).toHaveLength(1);
    expect(cv.projects.map((p) => p.facts)).toEqual([["ab10"]]);
    expect(jaccard("Wrote SQL queries in PostgreSQL to find duplicate refunds", "Raised unit-test coverage on the refunds service from 41% to 68%")).toBeLessThan(0.2);
  });

  it("writes out a project that shrank to a bare title, and lists certifications from the facts", () => {
    const withCert = { ...aoife, facts: [...aoife.facts, fact("c1", "certification", "AWS Certified Cloud Practitioner (2025)")] };
    const cv = composeCv(withCert, body({ summary: [{ text: "Graduate.", facts: ["ab1"] }], projects: [{ text: "Timetable app for Dublin Bus", facts: ["ab2"] }] }), undefined, NOW);
    expect(cv.projects[0].text).toMatch(/^Final-year project: a timetable app for Dublin Bus that predicts delays/);
    expect(cv.certifications?.map((c) => c.text)).toEqual(["AWS Certified Cloud Practitioner (2025)"]);
    expect(cvText(cv)).toContain("CERTIFICATIONS\n- AWS Certified Cloud Practitioner (2025)");
  });

  it("starts with a plain line from the facts when the guard left no profile", () => {
    const cv = composeCv(aoife, body({}), undefined, NOW);
    expect(cv.profile?.map((p) => p.text)).toEqual(["BSc Computer Science, University College Dublin, graduated 2026.", "Most recent role: Weekend Barista at Kiln Coffee."]);
  });

  it("scrubs prompt text out of Gemma's lines and falls back to the skill facts", () => {
    const cv = composeCv(aoife, body({ summary: [{ text: "Graduate who builds dashboards [posting].", facts: ["ab1"] }] }), undefined, NOW);
    expect(cv.profile?.[0].text).toBe("Graduate who builds dashboards.");
    expect(cv.skills).toEqual(["Python", "TypeScript", "React", "SQL", "PostgreSQL", "Git", "Docker"]);
    expect(scrub("What are your salary expectations? (needsYou: true, leave answer empty)")).toBe("What are your salary expectations?");
  });
});

it("guards the profile's opening sentence as the objective, so it may name the role as advertised", () => {
  const b = bodyFromDraft({ profile: [{ text: "Graduate applying for the Graduate Programme 2027. Built a React dashboard.", facts: ["ab1", "ab5"] }], keySkills: [{ label: "React", facts: ["ab5"] }], roles: [], projects: [], skills: [] });
  expect(b.objective?.map((s) => s.text)).toEqual(["Graduate applying for the Graduate Programme 2027."]);
  expect(b.summary.map((s) => s.text)).toEqual(["Built a React dashboard."]);
  expect(b.competencies).toEqual([{ label: "React", text: "", facts: ["ab5"] }]);
  expect(composeCv(aoife, b, undefined, NOW).profile?.map((p) => p.text)).toEqual(["Graduate applying for the Graduate Programme 2027.", "Built a React dashboard."]);
});

describe("the full-length CV (17 Oct 2026)", () => {
  const win = { id: "ab20", kind: "achievement" as const, text: "2nd place, Hack Ireland Cork (2026)", org: "Hack Ireland", source: "manual" as const, confirmed: true, createdAt: "2026-10-01" };
  const withWin = { ...aoife, facts: [...aoife.facts, win] };
  const draft = {
    profile: [{ text: "Computer science graduate of University College Dublin with a payments internship. Built a React dashboard for support agents.", facts: ["ab1", "ab4", "ab5"] }],
    aim: { text: "Seeking to grow as a Graduate Software Engineer at Cisco, bringing the testing habits that raised coverage from 41% to 68%.", facts: ["ab7"] },
    competencies: [{ label: "Software testing", text: "Added unit tests that raised coverage on a refunds service from 41% to 68%.", facts: ["ab7"] }],
    roles: [],
    projects: [],
    // A role id and an unknown id are ignored: only achievement facts, word for word.
    achievements: ["ab20", "ab4", "zz9"],
    skills: [],
  };

  it("closes the summary with the career objective and copies achievements word for word", () => {
    const b = bodyFromDraft(draft, withWin.facts);
    expect(b.aim?.map((a) => a.text)).toEqual([draft.aim.text]);
    expect(b.achievements).toEqual([{ text: "2nd place, Hack Ireland Cork (2026)", facts: ["ab20"] }]);
    const cv = composeCv(withWin, b, undefined, NOW);
    expect(cv.profile?.at(-1)?.text).toBe(draft.aim.text);
    expect(cv.competencies).toEqual([{ label: "Software testing", text: draft.competencies[0].text, facts: ["ab7"] }]);
    expect(cv.keySkills).toEqual([]);
    expect(cv.achievements?.map((a) => a.text)).toEqual(["2nd place, Hack Ireland Cork (2026)"]);
  });

  it("shows achievements that belong to no job or degree when Gemma picks none, and lays out a graduate's CV", () => {
    const cv = composeCv(withWin, bodyFromDraft({ ...draft, achievements: [] }, withWin.facts), undefined, NOW);
    expect(cv.achievements?.map((a) => a.facts)).toEqual([["ab20"]]);
    expect(cvSections(cv).map((s) => s.id)).toEqual(["header", "profile", "competencies", "experience", "projects", "education", "skills", "achievements", "languages"]);
    expect(cvText(cv)).toContain("- Software testing: Added unit tests");
  });

  it("keeps the aim when the guard checks it, since it may name the role as advertised", () => {
    const { body } = guardCv(bodyFromDraft(draft, withWin.facts), ledger(withWin.facts, []), "Graduate Software Engineer at Cisco, Galway.");
    expect(body.aim?.map((a) => a.text)).toEqual([draft.aim.text]);
  });
});

describe("kits saved before 16 Oct 2026", () => {
  // The old shape, as it sits in people's IndexedDB: objective, summary, competencies, achievements.
  const old = {
    header: { name: "Aoife Byrne", email: "aoife.byrne@example.ie", phone: null, location: "Dublin, Ireland", links: ["github.com/example-aoife"] },
    objective: [{ text: "To join Cisco as a Graduate Software Engineer.", facts: ["ab1"] }],
    summary: [{ text: "Computer science graduate.", facts: ["ab1"] }],
    competencies: [{ label: "Software testing", text: "Raised coverage from 41% to 68%.", facts: ["ab7"] }],
    experience: [{ title: "Software Engineering Intern", org: "Harbour Payments", where: "Dublin", dates: "Jun 2025 – Aug 2025", bullets: [{ text: "Built a React dashboard.", facts: ["ab5"] }] }],
    projects: [{ text: "Timetable app", facts: ["ab2"] }],
    leadership: false,
    education: [{ text: "BSc Computer Science, University College Dublin", dates: "", facts: ["ab1"] }],
    skills: ["Python"],
    languages: ["Irish (conversational)"],
    achievements: [{ text: "Final-year project graded first class", facts: ["ab3"] }],
  } as CvDocument;

  it("render through the same sections as new kits", async () => {
    expect(cvSections(old).map((s) => s.id)).toEqual(["header", "profile", "competencies", "experience", "projects", "education", "skills", "achievements", "languages"]);
    const text = cvText(old);
    expect(text).toContain("PROFESSIONAL SUMMARY\nTo join Cisco as a Graduate Software Engineer. Computer science graduate.");
    expect(text).toContain("- Software testing: Raised coverage from 41% to 68%.");
    expect(text).toContain("github.com/example-aoife");
    // No empty brackets for an undated degree.
    expect(text).toContain("BSc Computer Science, University College Dublin\n");
    expect(text).not.toContain("()");
    const xml = await (await JSZip.loadAsync(await Packer.toBuffer(cvDocx(old)))).file("word/document.xml")!.async("string");
    expect(xml.replace(/<[^>]+>/g, "")).toContain("ACHIEVEMENTS");
  });
});

describe("kit workflow", () => {
  const job = { id: "j1", title: "Graduate Software Engineer", company: "Cisco", location: "Galway", city: "Galway", description: "Build collaboration software in Python and React. Strong testing habits." } as unknown as ScoredJob;
  const fit = { verdict: "good" as const, requirements: [{ need: "Testing", match: "strong" as const, facts: ["ab7"], note: "" }], angle: "" };
  const replies = {
    cv: JSON.stringify({
      profile: [{ text: "Final-year student with 5 years of Kubernetes.", facts: [] }],
      keySkills: [{ label: "Unit testing", facts: ["ab7"] }],
      roles: [{ org: "Harbour Payments", bullets: [{ text: "Raised unit-test coverage on the refunds service from 41% to 68%.", facts: ["ab7"] }] }],
      projects: [{ text: "Timetable app for Dublin Bus", facts: ["ab2"] }],
      skills: ["Python", "SQL"],
    }),
    retry: JSON.stringify({ profile: [{ text: "Computer science graduate who raised unit-test coverage on a refunds service from 41% to 68%.", facts: ["ab1", "ab7"] }] }),
    letter: JSON.stringify({ paragraphs: [{ text: "Raising test coverage from 41% to 68% at Harbour Payments [posting] is the habit I'd bring.", facts: ["ab7"] }] }),
    answers: JSON.stringify({ why_company: { answer: "Cisco builds tools I use, and I built a React dashboard for support agents.", facts: ["ab5"] }, why_fit: { answer: "", facts: [] }, proud_of: { answer: "", facts: [] } }),
  };
  const asked: string[] = [];
  const reply = (prompt: string) => {
    const which = prompt.includes("A checker removed lines") ? "retry" : prompt.includes("Write a full CV") ? "cv" : prompt.includes("cover letter body") ? "letter" : "answers";
    asked.push(which);
    return replies[which];
  };
  const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
  const model = new MockLanguageModelV3({
    doGenerate: async (o) => ({ content: [{ type: "text", text: reply(JSON.stringify(o.prompt)) }], finishReason: { unified: "stop", raw: "stop" }, usage, warnings: [] }),
    doStream: async (o) => {
      const text = reply(JSON.stringify(o.prompt));
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "1" },
            { type: "text-delta", id: "1", delta: text },
            { type: "text-end", id: "1" },
            { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
          ],
        }),
      };
    },
  });
  const chain = { tier: "local", label: "mock", models: [{ id: "mock", model, maxRetries: 0 }] } as unknown as ModelChain;

  it("guards, retries an emptied profile once, owns the form questions and keeps no snapshot", async () => {
    const workflow = mastra.getWorkflow("kitWorkflow");
    const run = await workflow.createRun();
    const out = await run.start({ inputData: { job, profile: aoife, fit, include: { letter: true, answers: true } }, requestContext: new RequestContext([["chain", chain]]) });
    expect(out.status).toBe("success");
    const kit = (out as { result: Kit }).result;
    expect(asked.filter((a) => a === "cv" || a === "retry")).toEqual(["cv", "retry"]);
    expect(kit.cv?.profile?.[0].text).toMatch(/^Computer science graduate/);
    expect(kit.events.map((e) => e.rule)).toContain("uncited");
    expect(kit.letter?.paragraphs[0].text).not.toContain("[posting]");
    expect(kit.answers?.answers.map((a) => [a.question, a.needsYou])).toEqual([
      ["Why do you want to work at Cisco?", false],
      ["Why are you a good fit for this role?", true],
      ["Tell us about a project or achievement you're proud of.", true],
      ["What are your salary expectations?", true],
      ["What is your notice period or earliest start date?", true],
    ]);
    expect(kit.guardVersion).toBe(GUARD_VERSION);
    // A run's input is someone's name, email and facts: nothing of it stays on the server.
    const runs = await workflow.listWorkflowRuns();
    expect(runs.total).toBe(0);
  });
});

it("leaves the letter's greeting and sign-off to code, and drops a link word left dangling at the start", () => {
  const letter = tidyLetter([
    { text: "Dear Hiring Manager, for instance, my final-year project predicted bus delays.", facts: ["ab2"] },
    { text: "I raised unit-test coverage from 41% to 68%.", facts: ["ab7"] },
    { text: "I look forward to building payments software at Stripe. Sincerely, Aoife Byrne", facts: [] },
  ]);
  expect(letter.map((p) => p.text)).toEqual([
    "My final-year project predicted bus delays.",
    "I raised unit-test coverage from 41% to 68%.",
    "I look forward to building payments software at Stripe.",
  ]);
  expect(tidyLetter([{ text: "Thank you for your time.", facts: [] }])[0].text).toBe("Thank you for your time.");
  expect(tidyLetter([{ text: "A line.", facts: [] }, { text: "Kind regards,", facts: [] }])).toHaveLength(1);
});
