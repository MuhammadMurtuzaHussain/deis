"use client";

import { fromLinkedInExport, LINKEDIN_FILES, type LinkedInImport } from "./linkedin";

// Reading a CV happens on the user's device. A PDF or Word file is turned into text
// here and never uploaded; only that text goes to the user's chosen model to be split
// into facts. A LinkedIn data export ZIP needs no model at all.

export type FileRead = { kind: "text"; text: string; source: "cv" | "linkedin" } | { kind: "linkedin_export"; result: LinkedInImport };

async function pdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let text = "";
  for (let i = 1; i <= Math.min(doc.numPages, 8); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Keep line breaks: pdf.js marks the end of each visual line.
    text += content.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : "")).join("") + "\n";
  }
  return text;
}

async function docxText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value;
}

const MB = 1024 * 1024;
/** A LinkedIn export is a few MB. Anything far bigger isn't one, or is built to fill memory when unpacked. */
export const ZIP_LIMITS = { archive: 50 * MB, entry: 5 * MB };

async function zipFiles(file: File): Promise<Record<string, string>> {
  if (file.size > ZIP_LIMITS.archive) throw new Error("That ZIP is over 50 MB, which is too big for a LinkedIn data export.");
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const out: Record<string, string> = {};
  // Only the profile files: the export also holds private messages and contacts, and those are never opened.
  const wanted = Object.values(zip.files).filter((f) => !f.dir && LINKEDIN_FILES.includes(f.name.split("/").pop()!.toLowerCase()));
  for (const f of wanted) {
    // The size the archive declares, checked before unpacking; then the real size, in case it lied.
    const declared = (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    if (declared > ZIP_LIMITS.entry) continue;
    const text = await f.async("string");
    if (text.length > ZIP_LIMITS.entry) continue;
    out[f.name.split("/").pop()!.toLowerCase()] = text;
  }
  return out;
}

const tidy = (s: string) => s.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();

export async function readProfileFile(file: File): Promise<FileRead> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".zip")) {
    const files = await zipFiles(file);
    if (!files["positions.csv"] && !files["profile.csv"] && !files["education.csv"]) {
      throw new Error("That ZIP doesn't look like a LinkedIn data export (no Positions.csv or Profile.csv inside).");
    }
    return { kind: "linkedin_export", result: fromLinkedInExport(files) };
  }
  let text: string;
  if (name.endsWith(".pdf") || file.type === "application/pdf") text = await pdfText(file);
  else if (name.endsWith(".docx")) text = await docxText(file);
  else if (name.endsWith(".txt") || name.endsWith(".md")) text = await file.text();
  else throw new Error("Deis reads PDF, Word (.docx), text files and LinkedIn data export ZIPs.");
  text = tidy(text);
  if (text.length < 80) throw new Error("Couldn't find much text in that file. If it's a scanned image, paste the text instead.");
  // LinkedIn's "Save to PDF" has a recognisable layout.
  const source = /\bContact\b[\s\S]{0,400}\bwww\.linkedin\.com\/in\//i.test(text) || /\bTop Skills\b/.test(text) ? "linkedin" : "cv";
  return { kind: "text", text, source };
}
