import type { Fact, Header, Profile } from "../profile/types";
import type { Cited, CvBody } from "./schema";

// The finished CV. Gemma's guarded writing goes into the slots; everything a recruiter
// checks against your LinkedIn (name, employers, job titles, dates, degrees) is copied
// from the facts by code and never rewritten. Section order follows Irish convention:
// summary, competencies, experience, projects, education, skills, achievements.

export type CvRole = { title: string; org: string; where: string | null; dates: string; bullets: Cited[] };
export type CvDocument = {
  header: Header;
  summary: Cited[];
  competencies: { label: string; text: string; facts: string[] }[];
  experience: CvRole[];
  projects: Cited[];
  education: { text: string; dates: string; facts: string[] }[];
  skills: string[];
  achievements: Cited[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  if (/^present|current|now$/i.test(d.trim())) return "Present";
  const m = /^(\d{4})-(\d{1,2})/.exec(d);
  if (m) return `${MONTHS[Number(m[2]) - 1] ?? ""} ${m[1]}`.trim();
  return d.trim();
}

export function dateRange(start?: string | null, end?: string | null): string {
  const s = formatDate(start);
  const e = formatDate(end);
  if (s && e) return s === e ? s : `${s} – ${e}`;
  return s || e;
}

/** For ordering: "present" sorts first, then the latest end. */
const sortKey = (f: Fact) => (/present|current/i.test(f.end ?? "") ? "9999" : (f.end ?? f.start ?? "0000"));

const asCited = (f: Fact): Cited => ({ text: f.text, facts: [f.id] });

export function composeCv(profile: Pick<Profile, "header" | "facts">, body: CvBody): CvDocument {
  const facts = profile.facts.filter((f) => f.confirmed);
  const roles = facts.filter((f) => f.kind === "role").sort((a, b) => sortKey(b).localeCompare(sortKey(a)));

  const experience: CvRole[] = roles.map((r) => {
    const written = body.roles.find((x) => x.org === r.org)?.bullets ?? [];
    // No guarded bullets for this employer? Use the user's own facts for it, as written.
    const fallback = facts.filter((f) => f.org === r.org && f.kind !== "role" && f.kind !== "education").slice(0, 3).map(asCited);
    return {
      title: r.title ?? r.text,
      org: r.org ?? "",
      where: r.where ?? null,
      dates: dateRange(r.start, r.end),
      bullets: written.length ? written : fallback,
    };
  });

  const education = facts
    .filter((f) => f.kind === "education")
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
    .map((f) => ({ text: f.text, dates: dateRange(f.start, f.end), facts: [f.id] }));

  const projects = body.projects.length ? body.projects : facts.filter((f) => f.kind === "project").slice(0, 3).map(asCited);

  return {
    header: profile.header,
    summary: body.summary,
    competencies: body.competencies.slice(0, 7),
    experience,
    projects,
    education,
    skills: body.skills,
    achievements: body.achievements,
  };
}
