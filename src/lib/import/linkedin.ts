import { LANGUAGES } from "../jobs/languages";
import { parseFactDate } from "../profile/dates";
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

/**
 * "Jun 2023", "Sept 2021", "September 2021" or "09/2021" → "2023-06"; "2023" → "2023";
 * "Present" → "present"; "" → null. Facts store dates this way so roles sort by date.
 */
export function linkedinDate(s: string | null | undefined): string | null {
  const t = s?.trim();
  if (!t) return null;
  if (/^(?:present|current|now|ongoing|to date|today)$/i.test(t)) return "present";
  const d = parseFactDate(t);
  if (!d) return null;
  return d.month ? `${d.year}-${String(d.month).padStart(2, "0")}` : String(d.year);
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

/** The only files read from a LinkedIn export. Messages, connections and the rest stay inside the ZIP. */
export const LINKEDIN_FILES = ["profile.csv", "positions.csv", "education.csv", "skills.csv", "projects.csv", "certifications.csv", "languages.csv", "honors.csv"];

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

// ---- Facts the model read from a CV (POST /api/import)

const EXTRA_LANGUAGES = ["English", "Malayalam", "Tamil", "Telugu", "Urdu", "Bengali", "Punjabi", "Gujarati", "Marathi", "Vietnamese", "Thai", "Indonesian", "Malay", "Tagalog", "Lithuanian", "Latvian", "Estonian", "Slovak", "Slovenian", "Croatian", "Serbian", "Bulgarian", "Catalan", "Welsh", "Persian", "Farsi", "Swahili", "Yoruba", "Igbo", "Afrikaans", "Mandarin", "Cantonese", "Gaeilge"];
const LANGUAGE_NAME = new RegExp(`\\b(${[...LANGUAGES, ...EXTRA_LANGUAGES].join("|")})\\b`, "g");
const LEVEL = /\b(native|mother tongue|bilingual|fluent|fluency|proficient|advanced|upper[- ]intermediate|intermediate|conversational|working|professional|basic|beginner|elementary|limited|[ABC][12])\b/i;

/** "Irish is fluent", "Fluent in Irish" or "Spanish is at a B2 level" → "Irish (fluent)", "Spanish (B2)", as a CV writes them. */
export function languageLine(text: string): string {
  const names = [...new Set([...text.matchAll(LANGUAGE_NAME)].map((m) => m[1]))];
  // Lists ("English (native), Irish (fluent)") and lines already in that shape stay as written.
  if (names.length !== 1 || /^[A-Z][\w ]+ \([^)]+\)$/.test(text.trim())) return text;
  const level = LEVEL.exec(text)?.[1];
  if (!level) return names[0];
  const word = /^[ABC][12]$/i.test(level) ? level.toUpperCase() : level.toLowerCase().replace("fluency", "fluent").replace("mother tongue", "native");
  return `${names[0]} (${word})`;
}

/** Qualifiers models add to skills: "Proficient in Excel" from a CV that just says "Excel". */
const QUALIFIER = /^(?:highly\s+)?(proficient|experienced|skilled|expert|advanced|competent|familiar|knowledgeable|strong|solid|good|excellent)\s+(?:in|with|at|user of|knowledge of|understanding of|skills in|command of|grasp of)\s+/i;

/** Spaced ("2021 – 2025", "2021 to 2025") or not ("2021-2025", "Sep 2021-May 2024"); "2021-09" is one date. */
const RANGE = /^(.+?)\s+(?:–|-|—|to)\s+(.+)$|^(.*?\d{4})\s*[-–—]\s*((?:[A-Za-z]{3,}\.?\s+)?\d{4}|present|current|now)$/i;

type Extracted = { kind: Fact["kind"]; text: string; start?: string | null; end?: string | null; where?: string | null };

/**
 * Model-read CV facts in the shape facts are stored in: dates as "2025-06", "2025" or
 * "present" (so roles sort and "latest degree" is right), languages as "Irish (fluent)",
 * and skills without qualifiers the CV itself didn't use. `source` is the CV text.
 */
export function tidyImported<T extends Extracted>(f: T, source = ""): T {
  // A range in one field ("Sept 2021 – May 2025", "2021-2025") splits into start and end.
  const m = !f.end && f.start ? RANGE.exec(f.start.trim()) : null;
  const range = m ? [m[1] ?? m[3], m[2] ?? m[4]] : null;
  const start = linkedinDate(range ? range[0] : f.start) ?? f.start ?? null;
  const end = linkedinDate(range ? range[1] : f.end) ?? f.end ?? null;
  let text = f.text.trim();
  if (f.kind === "language") text = languageLine(text);
  if (f.kind === "skill" && source) {
    const q = QUALIFIER.exec(text);
    if (q && !new RegExp(`\\b${q[1]}\\b`, "i").test(source)) text = text.slice(q[0].length).replace(/^./, (c) => c.toUpperCase());
  }
  return { ...f, text, start, end, where: f.where?.trim() || null };
}
