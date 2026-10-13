import { AlignmentType, BorderStyle, Document, Packer, Paragraph, TabStopType, TextRun } from "docx";
import { projectsHeading, type CvDocument } from "./compose";
import type { Letter } from "./schema";
import type { Header } from "../profile/types";

// Word files an applicant tracking system can read: A4, one column, Arial, real
// headings and bullets, no tables, no photo, no text boxes. Filename follows the
// "Company - Role CV - Name" habit recruiters see most.

const FONT = "Arial";
const INK = "1F2A2E";
const BODY = 21; // half-points: 10.5 pt
const A4 = { width: 11906, height: 16838 };
const MARGIN = { top: 720, bottom: 720, left: 860, right: 860 };
const RIGHT_TAB = A4.width - MARGIN.left - MARGIN.right;

const run = (text: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) =>
  new TextRun({ text, font: FONT, size: o.size ?? BODY, bold: o.bold, italics: o.italics, color: o.color });

const heading = (text: string) =>
  new Paragraph({
    spacing: { before: 200, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: INK, space: 2 } },
    children: [run(text.toUpperCase(), { bold: true, size: 24, color: INK })],
  });

const para = (text: string, after = 60) => new Paragraph({ spacing: { after }, children: [run(text)] });
const bullet = (children: TextRun[]) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children });

function headerBlock(h: Header): Paragraph[] {
  const contact = [h.location, h.email, h.phone, ...(h.links ?? [])].filter(Boolean).join(" | ");
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [run(h.name || "Your name", { bold: true, size: 40, color: INK })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [run(contact, { size: 20, color: "333333" })] }),
  ];
}

export function cvDocx(cv: CvDocument): Document {
  const children: Paragraph[] = [...headerBlock(cv.header)];
  if (cv.objective?.length) {
    children.push(heading("Career objective"), para(cv.objective.map((s) => s.text).join(" "), 80));
  }
  if (cv.summary.length) {
    children.push(heading("Professional summary"), para(cv.summary.map((s) => s.text).join(" "), 80));
  }
  if (cv.competencies.length) {
    children.push(heading("Core competencies"));
    for (const c of cv.competencies) children.push(bullet([run(`${c.label}: `, { bold: true }), run(c.text)]));
  }
  if (cv.experience.length) {
    children.push(heading("Work experience"));
    for (const r of cv.experience) {
      children.push(
        new Paragraph({
          spacing: { before: 100, after: 40 },
          tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
          children: [run([r.title, r.org, r.where].filter(Boolean).join(", "), { bold: true }), run(`\t${r.dates}`, { bold: true })],
        }),
      );
      for (const b of r.bullets) children.push(bullet([run(b.text)]));
    }
  }
  if (cv.projects.length) {
    children.push(heading(projectsHeading(cv)));
    for (const p of cv.projects) children.push(bullet([run(p.text)]));
  }
  if (cv.education.length) {
    children.push(heading("Education"));
    for (const e of cv.education)
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
          children: [run(e.text, { bold: true }), run(e.dates ? `\t${e.dates}` : "")],
        }),
      );
  }
  if (cv.skills.length || cv.languages?.length) {
    children.push(heading("Skills"));
    if (cv.skills.length) children.push(para(cv.skills.join(", ")));
    if (cv.languages?.length) children.push(new Paragraph({ spacing: { after: 60 }, children: [run("Languages: ", { bold: true }), run(cv.languages.join("; "))] }));
  }
  if (cv.achievements.length) {
    children.push(heading("Achievements"));
    for (const a of cv.achievements) children.push(bullet([run(a.text)]));
  }
  children.push(new Paragraph({ spacing: { before: 200 }, children: [run("References available on request.", { italics: true })] }));
  return new Document({
    creator: cv.header.name || "Deis",
    title: `CV ${cv.header.name}`,
    sections: [{ properties: { page: { size: A4, margin: MARGIN } }, children }],
  });
}

export function letterDocx(letter: Letter, h: Header, jobTitle: string, date = new Date()): Document {
  const when = date.toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" });
  const children = [
    ...headerBlock(h),
    para(when, 160),
    para("Dear Hiring Team,", 120),
    new Paragraph({ spacing: { after: 160 }, children: [run(`Re: ${jobTitle}`, { bold: true })] }),
    ...letter.paragraphs.map((p) => para(p.text, 140)),
    para("Kind regards,", 60),
    para(h.name),
  ];
  return new Document({ creator: h.name || "Deis", sections: [{ properties: { page: { size: A4, margin: MARGIN } }, children }] });
}

export const toBlob = (doc: Document) => Packer.toBlob(doc);

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
export const cvFileName = (company: string, title: string, name: string) => `${safe(company)} - ${safe(title)} CV - ${safe(name || "Deis")}.docx`;
export const letterFileName = (company: string, title: string, name: string) => `${safe(company)} - ${safe(title)} Cover Letter - ${safe(name || "Deis")}.docx`;
