import { describe, expect, it } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";
import { cvDocx, cvFileName, letterDocx } from "@/lib/cv/docx";
import { composeCv, cvText, dateRange, type CvDocument } from "@/lib/cv/compose";
import { aoife } from "@/lib/demo/personas";

const NOW = new Date("2026-10-16T12:00:00Z");
const wordText = async (cv: CvDocument) => (await (await JSZip.loadAsync(await Packer.toBuffer(cvDocx(cv)))).file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, "");

describe("CV document", () => {
  const cv = composeCv(
    aoife,
    {
      objective: [],
      summary: [{ text: "Computer science graduate who builds tools people use.", facts: ["ab1"] }],
      competencies: [{ label: "Data", text: "", facts: ["ab6"] }],
      roles: [{ org: "Harbour Payments", bullets: [{ text: "Built a React dashboard for support agents", facts: ["ab5"] }] }],
      projects: [],
      achievements: [],
      skills: ["Python", "SQL"],
    },
    undefined,
    NOW,
  );

  it("takes employers, titles, dates and education from facts, newest first", () => {
    expect(cv.experience.map((r) => [r.org, r.title, r.dates])).toEqual([
      ["Kiln Coffee", "Weekend Barista", "Sep 2023 – May 2026"],
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
      objective: [],
      summary: [{ text: "Computer science graduate.", facts: ["ab1"] }],
      competencies: [{ label: "Unit testing", text: "", facts: ["ab7"] }],
      roles: [{ org: "Harbour Payments", bullets: [{ text: "Built a React dashboard for support agents", facts: ["ab5"] }] }],
      projects: [{ text: "Built a delay-predicting timetable app", facts: ["ab2"] }],
      achievements: [],
      skills: ["Python", "SQL", "Irish (conversational)"],
    },
    { requirements: [{ need: "React", match: "strong", facts: ["ab5"], note: "" }] },
    NOW,
  );

  it("puts the employer that matches the posting first", () => {
    expect(cv.experience.map((r) => r.org)).toEqual(["Harbour Payments", "Kiln Coffee"]);
  });

  it("always shows leadership and languages, and keeps spoken languages out of skills", () => {
    expect(cv.projects.map((p) => p.facts)).toEqual([["ab2"], ["ab10"]]);
    expect(cv.skills).toEqual(["Python", "SQL"]);
    expect(cv.keySkills).toEqual(["Unit testing"]);
    expect(cv.languages).toEqual(["Irish (conversational)"]);
  });

  it("writes the graduate layout into the Word file, in the same order as the text", async () => {
    const text = await wordText(cv);
    const order = ["PROFILE", "EDUCATION", "WORK EXPERIENCE", "SELECTED PROJECTS AND LEADERSHIP", "SKILLS", "LANGUAGES"].map((h) => text.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain("Key skills: Unit testing");
    expect(text).toContain("Irish (conversational)");
    const plain = cvText(cv);
    expect(plain.indexOf("EDUCATION")).toBeLessThan(plain.indexOf("WORK EXPERIENCE"));
    expect(plain).toContain("References available on request.");
  });
});
