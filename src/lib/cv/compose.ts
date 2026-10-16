import { companyKey } from "../jobs/normalise";
import { isFinished } from "../profile/dates";
import type { Fact, Header, Profile } from "../profile/types";
import type { Cited, CvBody, Fit } from "./schema";

// The finished CV. Gemma's guarded writing goes into the slots; everything a recruiter
// checks against your LinkedIn (name, employers, job titles, dates, degrees, certificates,
// languages) is copied from the facts by code and never rewritten. A graduate's CV
// follows the Irish graduate layout: profile, education, experience, projects and
// leadership, skills, certifications, languages. cvSections() is the one order the
// Word file, the preview and "Copy as text" all render.

export type CvRole = { title: string; org: string; where: string | null; dates: string; bullets: Cited[] };
export type CvEducation = { text: string; dates: string; facts: string[]; /** Grade, dissertation, modules: the user's own lines. */ lines?: Cited[] };
export type CvDocument = {
  header: Header;
  /** 2 or 3 sentences. Kits built before 16 Oct 2026 have an objective and a summary instead. */
  profile?: Cited[];
  /** Graduates and students: education straight after the profile. */
  educationFirst?: boolean;
  education: CvEducation[];
  experience: CvRole[];
  projects: Cited[];
  /** The projects section includes societies or other leadership. */
  leadership?: boolean;
  keySkills?: string[];
  skills: string[];
  certifications?: Cited[];
  languages?: string[];
  // Older kits, still on people's devices:
  objective?: Cited[];
  summary?: Cited[];
  competencies?: { label: string; text: string; facts: string[] }[];
  achievements?: Cited[];
};

export const projectsHeading = (cv: Pick<CvDocument, "leadership">) => (cv.leadership ? "Selected projects and leadership" : "Selected projects");
export const REFERENCES = "References available on request.";

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
const newestFirst = (a: Fact, b: Fact) => sortKey(b).localeCompare(sortKey(a));
const yearOf = (d?: string | null) => Number(/\d{4}/.exec(d ?? "")?.[0] ?? 0);

const asCited = (f: Fact): Cited => ({ text: f.text, facts: [f.id] });
const sameOrg = (a?: string | null, b?: string | null) => Boolean(a && b && companyKey(a) === companyKey(b));
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** First word of three letters or more: "English (fluent)" → "english". */
const firstWord = (s: string) => s.toLowerCase().match(/[a-zÀ-ɏ]{3,}/)?.[0];

/** Last line of defence against prompt text in Gemma's writing: "[posting]", "[ab5]", "(needsYou: true …)". */
export function scrub(s: string): string {
  return s
    .replace(/\s*\[[^\]\n]{0,60}\]/g, "")
    .replace(/\s*\([^()\n]{0,40}\b(?:needsYou|posting|fact ids?)\b[^()\n]{0,60}\)/gi, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const STOP = new Set(["the", "and", "for", "with", "from", "that", "this", "into", "using", "used", "which", "were", "was", "are", "has", "have", "had", "its", "their", "each", "over", "per", "who"]);
const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9à-ÿ%+#]+/).filter((t) => t.length > 2 && !STOP.has(t)));

/** Shared words over all words: 1 for the same line, about 0.5 for the same fact reworded. */
export function jaccard(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const t of A) if (B.has(t)) both++;
  return both / (A.size + B.size - both);
}

/** Drops a line whose facts are all on the page already, or that nearly repeats a line above it. */
function onlyNew(lines: Cited[], seen: { lines: Cited[]; facts: Set<string> }): Cited[] {
  return lines.filter((line) => {
    const repeatsFacts = line.facts.length > 0 && line.facts.every((id) => seen.facts.has(id));
    if (repeatsFacts || seen.lines.some((s) => jaccard(s.text, line.text) > 0.45)) return false;
    seen.lines.push(line);
    for (const id of line.facts) seen.facts.add(id);
    return true;
  });
}

/** Soft skills say little about which job matters for this posting, unless the must-have also names hard work ("collaborative coding projects"). */
const HARD = /\b(cod(e|ing)|program(ming)?|software|engineer(ing)?|data|technical|technolog(y|ies)|internships?|projects?|systems?|development|analy(sis|tics|se|ze)|tools?|finance|accounts?)\b/i;
const SOFT = /\b(communicat|team ?work|team player|collaborat|interpersonal|problem[- ]solving|attention to detail|detail[- ]oriented|independen|self[- ]motivat|motivat|time management|organi[sz]ation|adaptab|flexib|work ethic|enthusias|eager|curious|curiosity|positive attitude|customer service|people skills|willing(ness)? to learn|leadership)/i;

/** 2 for each hard-skill must-have a job's facts match strongly, 1 for each that carries over. */
export function employerWeights(fit: Pick<Fit, "requirements"> | undefined, facts: Fact[]): Map<string, number> {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const weights = new Map<string, number>();
  for (const r of fit?.requirements ?? []) {
    if (r.match === "gap" || (SOFT.test(r.need) && !HARD.test(r.need))) continue;
    const orgs = new Set(r.facts.map((id) => byId.get(id)?.org).filter((o): o is string => Boolean(o)).map(companyKey));
    for (const o of orgs) weights.set(o, (weights.get(o) ?? 0) + (r.match === "strong" ? 2 : 1));
  }
  return weights;
}

const PART_TIME = /\b(part[- ]time|weekend|evening|summer|seasonal)\b/i;
/** "Part-time Customer Assistant": the bare title would lose what makes the job part-time. */
function roleTitle(f: Fact): string {
  const title = f.title ?? f.text;
  if (!PART_TIME.test(f.text) || PART_TIME.test(title)) return title;
  return f.text.length <= 60 ? f.text : `${title} (part-time)`;
}

/** Only when the guard left no profile: a plain line from the facts, so the CV never starts empty. */
function templatedProfile(degree: Fact | undefined, role: Fact | undefined, now: Date): Cited[] {
  const parts: Cited[] = [];
  if (degree) {
    const year = yearOf(degree.end);
    const status = !year ? "" : isFinished(degree, now) ? `, graduated ${year}` : `, finishing ${year}`;
    parts.push({ text: `${degree.text}${status}.`, facts: [degree.id] });
  }
  if (role?.org) parts.push({ text: `Most recent role: ${roleTitle(role)} at ${role.org}.`, facts: [role.id] });
  return parts;
}

export function composeCv(profile: Pick<Profile, "header" | "facts">, body: CvBody, fit?: Pick<Fit, "requirements">, now = new Date()): CvDocument {
  const facts = profile.facts.filter((f) => f.confirmed);
  const byId = new Map(facts.map((f) => [f.id, f]));
  const clean = (lines: Cited[]) => lines.map((l) => ({ ...l, text: scrub(l.text) })).filter((l) => l.text);

  // Employers that match this posting's hard skills come first, then the rest; newest first within each.
  const weights = employerWeights(fit, facts);
  const weight = (f: Fact) => (f.org ? (weights.get(companyKey(f.org)) ?? 0) : 0);
  const roles = facts.filter((f) => f.kind === "role").sort((a, b) => weight(b) - weight(a) || newestFirst(a, b));

  // Education, newest first. A degree's own grades, awards and modules sit under it, as written.
  const dated = (f: Fact) => Boolean(f.start || f.end);
  const allEducation = facts.filter((f) => f.kind === "education").sort(newestFirst);
  const degrees = allEducation.filter((f) => dated(f) || !allEducation.some((d) => d !== f && dated(d) && sameOrg(d.org, f.org)));
  // An achievement at a place you also worked belongs to the job.
  const degreeFor = (f: Fact) => (f.kind !== "education" && roles.some((r) => sameOrg(r.org, f.org)) ? undefined : degrees.find((d) => d !== f && sameOrg(d.org, f.org)));
  const underDegree = facts.filter((f) => (f.kind === "achievement" || f.kind === "other" || (f.kind === "education" && !degrees.includes(f))) && degreeFor(f));

  const latestDegree = degrees.find((d) => d.end) ?? degrees[0];
  const educationFirst = Boolean(latestDegree) && (!roles.length || !isFinished(latestDegree, now) || yearOf(latestDegree.end) >= now.getFullYear() - 2);

  // A bare title ("Timetable app for Dublin Bus") says less than the fact it came from.
  const written = clean(body.projects).map((p) => {
    const source = p.facts.map((id) => byId.get(id)).find(Boolean);
    return wordCount(p.text) < 8 && source ? asCited(source) : p;
  });
  const projectLines = written.length ? written : facts.filter((f) => f.kind === "project").slice(0, 3).map(asCited);
  // Societies and other leadership always make the page, in the user's own words if Gemma skipped them.
  const leadership = facts.filter((f) => f.kind === "leadership");
  const cited = new Set(projectLines.flatMap((p) => p.facts));
  const allProjects = [...projectLines, ...leadership.filter((f) => !cited.has(f.id)).map(asCited)];
  const certificationLines = facts.filter((f) => f.kind === "certification").map(asCited);

  // Each fact appears once: lines are kept in page order, and a later line that repeats one above goes.
  const seen = { lines: [] as Cited[], facts: new Set<string>() };
  const educationOf = () =>
    degrees.map((d) => ({ text: d.text, dates: dateRange(d.start, d.end), facts: [d.id], lines: onlyNew(underDegree.filter((f) => degreeFor(f) === d).map(asCited), seen) }));
  const experienceOf = () =>
    roles.map((r) => {
      const mine = body.roles.find((x) => sameOrg(x.org, r.org))?.bullets ?? [];
      // No guarded bullets for this employer? Use the user's own facts for it, as written.
      const fallback = facts.filter((f) => sameOrg(f.org, r.org) && f.kind !== "role" && f.kind !== "education").slice(0, 3).map(asCited);
      // "Served as a Customer Assistant" only restates the title above it.
      const bullets = clean(mine).filter((b) => b.facts.some((id) => byId.get(id)?.kind !== "role"));
      return { title: roleTitle(r), org: r.org ?? "", where: r.where ?? null, dates: dateRange(r.start, r.end), bullets: onlyNew(bullets.length ? bullets : fallback, seen) };
    });
  let education: CvEducation[] = [];
  let experience: CvRole[] = [];
  if (educationFirst) {
    education = educationOf();
    experience = experienceOf();
  } else {
    experience = experienceOf();
    education = educationOf();
  }
  const projects = onlyNew(allProjects, seen);
  const certifications = onlyNew(certificationLines, seen);

  const languages = facts.filter((f) => f.kind === "language").map((f) => f.text);
  const spoken = new Set(languages.join(" ").toLowerCase().match(/[a-zÀ-ɏ]{3,}/g) ?? []);
  const keySkills = [...new Map(body.competencies.map((c) => scrub(c.label)).filter(Boolean).map((l) => [l.toLowerCase(), l])).values()].slice(0, 8);
  const taken = new Set(keySkills.map((k) => k.toLowerCase()));
  // "Excel (pivot tables, VLOOKUP), Xero" is two skills: commas inside brackets don't split.
  const fromFacts = facts.filter((f) => f.kind === "skill").flatMap((f) => f.text.split(/\s*[,;]\s*(?![^(]*\))/));
  const skills = (body.skills.length ? body.skills.map(scrub) : fromFacts).filter((s) => s && !spoken.has(firstWord(s) ?? "") && !taken.has(s.toLowerCase()));

  // The profile's opening sentence is guarded as the objective, so it may name the role as advertised.
  const profileLines = clean([...(body.objective ?? []), ...body.summary]);
  return {
    header: profile.header,
    profile: profileLines.length ? profileLines : templatedProfile(latestDegree, roles.slice().sort(newestFirst)[0], now),
    educationFirst,
    education,
    experience,
    projects,
    leadership: leadership.length > 0,
    keySkills,
    skills: [...new Set(skills)],
    certifications,
    languages,
  };
}

// ---- One order for every way the CV leaves the app

export type CvLine = Cited & { label?: string };
export type CvEntry = { heading: string; dates: string; facts: string[]; lines: CvLine[] };
export type CvSectionId = "profile" | "competencies" | "education" | "experience" | "projects" | "achievements" | "skills" | "certifications" | "languages";
export type CvSection =
  | { id: "header"; name: string; contact: string }
  | { id: CvSectionId; title: string; paragraph?: CvLine[]; entries?: CvEntry[]; bullets?: CvLine[]; lists?: { label: string; items: string[] }[] };

/** The CV as ordered sections. Kits saved before 16 Oct 2026 (objective, summary, competencies, achievements) map onto the same list. */
export function cvSections(cv: CvDocument, header: Header = cv.header): CvSection[] {
  const profile = cv.profile ?? [...(cv.objective ?? []), ...(cv.summary ?? [])];
  const skillLists = [
    ...(cv.keySkills?.length ? [{ label: "Key skills", items: cv.keySkills }] : []),
    ...(cv.skills.length ? [{ label: cv.keySkills?.length ? "Technical" : "", items: cv.skills }] : []),
  ];
  const sections: CvSection[] = [
    { id: "profile", title: "Profile", paragraph: profile },
    { id: "competencies", title: "Core competencies", bullets: (cv.competencies ?? []).map((c) => ({ label: c.label, text: c.text, facts: c.facts })) },
    { id: "education", title: "Education", entries: cv.education.map((e) => ({ heading: e.text, dates: e.dates, facts: e.facts, lines: e.lines ?? [] })) },
    { id: "experience", title: "Work experience", entries: cv.experience.map((r) => ({ heading: [r.title, r.org, r.where].filter(Boolean).join(", "), dates: r.dates, facts: [], lines: r.bullets })) },
    { id: "projects", title: projectsHeading(cv), bullets: cv.projects },
    { id: "achievements", title: "Achievements", bullets: cv.achievements ?? [] },
    { id: "skills", title: "Skills", lists: skillLists },
    { id: "certifications", title: "Certifications", bullets: cv.certifications ?? [] },
    { id: "languages", title: "Languages", lists: cv.languages?.length ? [{ label: "", items: cv.languages }] : [] },
  ];
  const order: CvSectionId[] = cv.educationFirst
    ? ["profile", "education", "experience", "projects", "skills", "certifications", "languages"]
    : ["profile", "competencies", "experience", "projects", "education", "skills", "achievements", "certifications", "languages"];
  const filled = (s: CvSection) => s.id === "header" || Boolean(s.paragraph?.length || s.entries?.length || s.bullets?.length || s.lists?.length);
  const contact = [header.location, header.email, header.phone, ...(header.links ?? [])].filter(Boolean).join(" | ");
  return [{ id: "header", name: header.name || "Your name", contact }, ...order.map((id) => sections.find((s) => s.id === id)!).filter(filled)];
}

/** "Copy as text": the same sections as the Word file, as plain lines. */
export function cvText(cv: CvDocument, header: Header = cv.header): string {
  const out: string[] = [];
  for (const s of cvSections(cv, header)) {
    if (s.id === "header") {
      out.push(s.name, s.contact, "");
      continue;
    }
    out.push(s.title.toUpperCase());
    if (s.paragraph?.length) out.push(s.paragraph.map((l) => l.text).join(" "));
    for (const e of s.entries ?? []) out.push(e.dates ? `${e.heading} (${e.dates})` : e.heading, ...e.lines.map((l) => `- ${l.text}`));
    for (const b of s.bullets ?? []) out.push(`- ${b.label ? `${b.label}: ` : ""}${b.text}`);
    for (const l of s.lists ?? []) out.push(`${l.label ? `${l.label}: ` : ""}${l.items.join(", ")}`);
    out.push("");
  }
  out.push(REFERENCES);
  return out.join("\n");
}
