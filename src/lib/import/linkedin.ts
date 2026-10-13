import { newFactId, type Fact, type Header } from "../profile/types";

// LinkedIn won't let apps read your profile, but it will give you your own data:
// Settings → Data privacy → Get a copy of your data. The ZIP holds CSVs (Profile,
// Positions, Education, Skills, Projects, Certifications, Languages). They're already
// structured, so they become facts with no AI at all. Everything still needs the
// user's confirmation before it's used.

/** RFC 4180-ish: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Some exports start with "Notes:" lines before the header row.
  const headerAt = rows.findIndex((r) => r.some((h) => h.trim()) && r.every((h) => h.trim().length < 40) && !/^notes?:/i.test(r[0] ?? ""));
  if (headerAt < 0) return [];
  const header = rows[headerAt].map((h) => h.trim());
  return rows
    .slice(headerAt + 1)
    .filter((r) => r.some((v) => v.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

/** "Jun 2023" → "2023-06"; "2023" → "2023"; "" → null. */
export function linkedinDate(s: string | undefined): string | null {
  if (!s?.trim()) return null;
  const m = /^([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(s.trim());
  if (m) return `${m[2]}-${MONTHS[m[1].toLowerCase()] ?? "01"}`;
  const y = /(\d{4})/.exec(s);
  return y ? y[1] : null;
}

/** Split a position's description into separate achievements: bullets, lines or sentences. */
export function splitDescription(text: string): string[] {
  const lines = text
    .split(/\n+|(?:^|\s)[•▪●◦\-*]\s+/)
    .map((l) => l.replace(/^[\s•▪●◦\-*]+/, "").trim())
    .filter((l) => l.length > 12);
  const parts = lines.length > 1 ? lines : text.split(/(?<=[.;])\s+(?=[A-Z])/).map((l) => l.trim());
  return parts
    .filter((l) => l.length > 12)
    .map((l) => l.replace(/\.$/, ""))
    .slice(0, 12);
}

const at = () => new Date().toISOString();
const fact = (kind: Fact["kind"], text: string, extra: Partial<Fact> = {}): Fact => ({
  id: newFactId(),
  kind,
  text: text.slice(0, 400),
  source: "linkedin_export",
  confirmed: false,
  createdAt: at(),
  ...extra,
});

export type LinkedInImport = { header: Partial<Header>; facts: Fact[]; files: string[] };

/** `files` maps lower-cased file names (without folders) to their text. */
export function fromLinkedInExport(files: Record<string, string>): LinkedInImport {
  const get = (name: string) => (files[name.toLowerCase()] ? parseCsv(files[name.toLowerCase()]) : []);
  const facts: Fact[] = [];
  const header: Partial<Header> = {};

  const [profile] = get("profile.csv");
  if (profile) {
    header.name = [profile["First Name"], profile["Last Name"]].filter(Boolean).join(" ") || undefined;
    header.location = profile["Geo Location"] || undefined;
    if (profile.Summary) for (const s of splitDescription(profile.Summary).slice(0, 4)) facts.push(fact("other", s));
  }

  for (const p of get("positions.csv")) {
    const org = p["Company Name"];
    const title = p.Title;
    if (!org || !title) continue;
    const start = linkedinDate(p["Started On"]);
    const end = linkedinDate(p["Finished On"]) ?? "present";
    facts.push(fact("role", title, { org, title, start, end, where: p.Location || null }));
    for (const line of splitDescription(p.Description ?? "")) facts.push(fact("achievement", line, { org }));
  }

  for (const e of get("education.csv")) {
    const school = e["School Name"];
    if (!school) continue;
    const degree = e["Degree Name"];
    facts.push(fact("education", [degree, school].filter(Boolean).join(", "), { org: school, start: linkedinDate(e["Start Date"]), end: linkedinDate(e["End Date"]) }));
    if (e.Activities) facts.push(fact("leadership", e.Activities, { org: school }));
  }

  for (const p of get("projects.csv")) if (p.Title) facts.push(fact("project", [p.Title, p.Description].filter(Boolean).join(": "), { start: linkedinDate(p["Started On"]), end: linkedinDate(p["Finished On"]) }));
  for (const c of get("certifications.csv")) if (c.Name) facts.push(fact("certification", [c.Name, c.Authority].filter(Boolean).join(", "), { start: linkedinDate(c["Started On"]) }));
  for (const l of get("languages.csv")) if (l.Name) facts.push(fact("language", [l.Name, l.Proficiency && `(${l.Proficiency.toLowerCase()})`].filter(Boolean).join(" ")));
  for (const h of get("honors.csv")) if (h.Title) facts.push(fact("achievement", [h.Title, h.Description].filter(Boolean).join(": ")));

  const skills = get("skills.csv").map((s) => s.Name).filter(Boolean);
  // Skills arrive as one long list; group them so each fact stays readable.
  for (let i = 0; i < skills.length; i += 10) facts.push(fact("skill", skills.slice(i, i + 10).join(", ")));

  return { header, facts, files: Object.keys(files) };
}
