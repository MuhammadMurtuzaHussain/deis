import { describe, expect, it } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";
import { cvDocx, cvFileName, letterDocx } from "@/lib/cv/docx";
import { composeCv, dateRange, projectsHeading } from "@/lib/cv/compose";
import { aoife } from "@/lib/demo/personas";

describe("CV document", () => {
  const cv = composeCv(aoife, {
    objective: [],
    summary: [{ text: "Computer science graduate who builds tools people use.", facts: ["ab1"] }],
    competencies: [{ label: "Data", text: "SQL in PostgreSQL to find duplicate refunds", facts: ["ab6"] }],
    roles: [{ org: "Harbour Payments", bullets: [{ text: "Built a React dashboard for support agents", facts: ["ab5"] }] }],
    projects: [],
    achievements: [],
    skills: ["Python", "SQL"],
  });

  it("takes employers, titles, dates and education from facts, newest first", () => {
    expect(cv.experience.map((r) => [r.org, r.title, r.dates])).toEqual([
      ["Kiln Coffee", "Barista", "Sep 2023 – May 2026"],
      ["Harbour Payments", "Software Engineering Intern", "Jun 2025 – Aug 2025"],
    ]);
    // No guarded bullets for the café, so the user's own facts stand in.
    expect(cv.experience[0].bullets[0].text).toBe("Trained 4 new staff on the till and opening checklist");
    expect(cv.education[0]).toMatchObject({ text: "BSc Computer Science, University College Dublin", dates: "2022 – 2026" });
    expect(cv.projects[0].facts).toEqual(["ab2"]);
  });

  it("writes a Word file whose text a tracking system can read", async () => {
    const buf = await Packer.toBuffer(cvDocx(cv));
    const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
    const text = xml.replace(/<[^>]+>/g, "");
    expect(text).toContain("Aoife Byrne");
    expect(text).toContain("WORK EXPERIENCE");
    expect(text).toContain("Built a React dashboard for support agents");
    expect(xml).not.toContain("<w:tbl>");
    const letter = await Packer.toBuffer(letterDocx({ paragraphs: [{ text: "One.", facts: [] }, { text: "Two.", facts: [] }, { text: "Three.", facts: [] }] }, aoife.header, "Graduate Engineer"));
    expect(letter.byteLength).toBeGreaterThan(1000);
  });

  it("names files the way recruiters expect", () => {
    expect(cvFileName("Stripe", "Software Engineer, New Grad", "Aoife Byrne")).toBe("Stripe - Software Engineer, New Grad CV - Aoife Byrne.docx");
    expect(dateRange("2025-06", "present")).toBe("Jun 2025 – Present");
  });
});

describe("CV for a posting", () => {
  const cv = composeCv(
    aoife,
    {
      objective: [{ text: "Seeks a place on the graduate programme, bringing React and SQL from a payments internship.", facts: ["ab5", "ab6"] }],
      summary: [{ text: "Computer science graduate.", facts: ["ab1"] }],
      competencies: [],
      roles: [{ org: "Harbour Payments", bullets: [{ text: "Built a React dashboard for support agents", facts: ["ab5"] }] }],
      projects: [{ text: "Built a delay-predicting timetable app", facts: ["ab2"] }],
      achievements: [
        { text: "Built a React dashboard used by support agents", facts: ["ab5"] },
        { text: "Final-year project graded first class", facts: ["ab3"] },
      ],
      skills: ["Python", "SQL", "Irish (conversational)"],
    },
    { requirements: [{ need: "React", match: "strong", facts: ["ab5"], note: "" }] },
  );

  it("puts the employer that matches the posting first", () => {
    expect(cv.experience.map((r) => r.org)).toEqual(["Harbour Payments", "Kiln Coffee"]);
    expect(cv.objective?.[0].text).toMatch(/^Seeks a place/);
  });

  it("keeps achievements to awards, and always shows leadership and languages", () => {
    expect(cv.achievements.map((a) => a.facts)).toEqual([["ab3"]]);
    expect(cv.projects.map((p) => p.facts)).toEqual([["ab2"], ["ab10"]]);
    expect(projectsHeading(cv)).toBe("Selected projects and leadership");
    expect(cv.skills).toEqual(["Python", "SQL"]);
    expect(cv.languages).toEqual(["Irish (conversational)"]);
  });

  it("writes the objective and languages into the Word file", async () => {
    const xml = await (await JSZip.loadAsync(await Packer.toBuffer(cvDocx(cv)))).file("word/document.xml")!.async("string");
    const text = xml.replace(/<[^>]+>/g, "");
    expect(text.indexOf("CAREER OBJECTIVE")).toBeLessThan(text.indexOf("PROFESSIONAL SUMMARY"));
    expect(text).toContain("SELECTED PROJECTS AND LEADERSHIP");
    expect(text).toContain("Languages: Irish (conversational)");
  });
});
