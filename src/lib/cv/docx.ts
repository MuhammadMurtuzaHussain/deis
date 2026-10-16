import { AlignmentType, BorderStyle, Document, Packer, Paragraph, TabStopType, TextRun } from "docx";
import { cvSections, REFERENCES, type CvDocument } from "./compose";
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

function headerBlock(name: string, contact: string): Paragraph[] {
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [run(name || "Your name", { bold: true, size: 40, color: INK })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [run(contact, { size: 20, color: "333333" })] }),
  ];
}
const contactOf = (h: Header) => [h.location, h.email, h.phone, ...(h.links ?? [])].filter(Boolean).join(" | ");

/** Heading on the left, dates on a right tab stop: a job or a degree. */
const entry = (heading: string, dates: string) =>
  new Paragraph({
    spacing: { before: 100, after: 40 },
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
    children: [run(heading, { bold: true }), run(dates ? `\t${dates}` : "", { bold: true })],
  });

export function cvDocx(cv: CvDocument, header: Header = cv.header): Document {
  const children: Paragraph[] = [];
  for (const s of cvSections(cv, header)) {
    if (s.id === "header") {
      children.push(...headerBlock(s.name, s.contact));
      continue;
    }
    children.push(heading(s.title));
    if (s.paragraph?.length) children.push(para(s.paragraph.map((l) => l.text).join(" "), 80));
    for (const e of s.entries ?? []) {
      children.push(entry(e.heading, e.dates));
      for (const l of e.lines) children.push(bullet([run(l.text)]));
    }
    for (const b of s.bullets ?? []) children.push(bullet(b.label ? [run(`${b.label}: `, { bold: true }), run(b.text)] : [run(b.text)]));
    for (const l of s.lists ?? [])
      children.push(new Paragraph({ spacing: { after: 60 }, children: l.label ? [run(`${l.label}: `, { bold: true }), run(l.items.join(", "))] : [run(l.items.join(", "))] }));
  }
  children.push(new Paragraph({ spacing: { before: 200 }, children: [run(REFERENCES, { italics: true })] }));
  return new Document({
    creator: header.name || "Deis",
    title: `CV ${header.name}`,
    sections: [{ properties: { page: { size: A4, margin: MARGIN } }, children }],
  });
}

export function letterDocx(letter: Letter, h: Header, jobTitle: string, date = new Date()): Document {
  const when = date.toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" });
  const children = [
    ...headerBlock(h.name, contactOf(h)),
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
