import { describe, expect, it } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";
import { cvDocx, cvFileName, letterDocx } from "@/lib/cv/docx";
import { composeCv, dateRange } from "@/lib/cv/compose";
import { aoife } from "@/lib/demo/personas";

describe("CV document", () => {
  const cv = composeCv(aoife, {
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
