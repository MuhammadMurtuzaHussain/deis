import type { Fact, Header, Profile } from "../profile/types";
import type { Cited, CvBody, Fit } from "./schema";

// The finished CV. Gemma's guarded writing goes into the slots; everything a recruiter
// checks against your LinkedIn (name, employers, job titles, dates, degrees) is copied
// from the facts by code and never rewritten. Section order follows Irish convention:
// objective, summary, competencies, experience, projects and leadership, education,
// skills and languages, achievements.

export type CvRole = { title: string; org: string; where: string | null; dates: string; bullets: Cited[] };
export type CvDocument = {
  header: Header;
  /** Kits built before 13 Oct 2026 have no objective or languages. */
  objective?: Cited[];
  summary: Cited[];
  competencies: { label: string; text: string; facts: string[] }[];
  experience: CvRole[];
  projects: Cited[];
  /** The projects section includes societies or other leadership. */
  leadership?: boolean;
  education: { text: string; dates: string; facts: string[] }[];
  skills: string[];
  languages?: string[];
  achievements: Cited[];
};

export const projectsHeading = (cv: CvDocument) => (cv.leadership ? "Selected projects and leadership" : "Selected projects");

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

/** First word of three letters or more: "English (fluent)" → "english". */
const firstWord = (s: string) => s.toLowerCase().match(/[a-zÀ-ɏ]{3,}/)?.[0];

export function composeCv(profile: Pick<Profile, "header" | "facts">, body: CvBody, fit?: Pick<Fit, "requirements">): CvDocument {
  const facts = profile.facts.filter((f) => f.confirmed);
  const byId = new Map(facts.map((f) => [f.id, f]));
  // Employers the fit check matched to this posting come first, then the rest; newest first within each.
  const matched = new Set((fit?.requirements ?? []).filter((r) => r.match !== "gap").flatMap((r) => r.facts.map((id) => byId.get(id)?.org)));
  const roles = facts
    .filter((f) => f.kind === "role")
    .sort((a, b) => Number(matched.has(b.org)) - Number(matched.has(a.org)) || sortKey(b).localeCompare(sortKey(a)));

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

  const written = body.projects.length ? body.projects : facts.filter((f) => f.kind === "project").slice(0, 3).map(asCited);
  // Societies and other leadership always make the page, in the user's own words if Gemma skipped them.
  const inProjects = new Set(written.flatMap((p) => p.facts));
  const leadership = facts.filter((f) => f.kind === "leadership");
  const projects = [...written, ...leadership.filter((f) => !inProjects.has(f.id)).map(asCited)];

  // Achievements are awards and wins, not the role bullets again.
  const used = new Set([...experience.flatMap((r) => r.bullets.flatMap((b) => b.facts)), ...projects.flatMap((p) => p.facts)]);
  const achievements = body.achievements.filter((a) => !a.facts.length || a.facts.some((id) => !used.has(id)));
  const employers = new Set(roles.map((r) => r.org));
  const listed = new Set([...used, ...achievements.flatMap((a) => a.facts)]);
  const awards = facts.filter((f) => f.kind === "achievement" && !employers.has(f.org) && !listed.has(f.id)).map(asCited);

  const languages = facts.filter((f) => f.kind === "language").map((f) => f.text);
  const spoken = new Set(languages.join(" ").toLowerCase().match(/[a-zÀ-ɏ]{3,}/g) ?? []);

  return {
    header: profile.header,
    objective: body.objective ?? [],
    summary: body.summary,
    competencies: body.competencies.slice(0, 7),
    experience,
    projects,
    leadership: leadership.length > 0,
    education,
    skills: body.skills.filter((s) => !spoken.has(firstWord(s) ?? "")),
    languages,
    achievements: [...achievements, ...awards],
  };
}
