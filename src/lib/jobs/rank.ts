import type { Fact, Preferences } from "../profile/types";
import { categoriesForTitle } from "./categories";
import { speaksEnough } from "./languages";
import { workFit, type WorkFit } from "./rightToWork";
import { studentOnly, visibleByDefault } from "./seniority";
import type { ScoredJob } from "./types";

// Which cards you see, and in what order. All code, no model: the deck has to be
// instant and free. Gemma only writes the "why" lines on the cards about to show.

export type HiddenReason = "level" | "stretch" | "student" | "language" | "permit" | "city" | "role" | "seen";
export type DeckEntry = { job: ScoredJob; rank: number; work: WorkFit; matched: string[] };
export type Deck = { entries: DeckEntry[]; hidden: Record<HiddenReason, number> };

const STOP = new Set(
  "about above after again also and any are based been being both but can could did does doing during each few for from further had has have having her here hers him his how into its itself just more most other our ours out over own same she should some such than that the their them then there these they this those through too under until very was were what when where which while who whom why will with would you your yours work team role skills experience using used built across within including strong ability good excellent one two three four five first new year years events event ireland irish dublin cork galway limerick waterford remote hybrid university college school".split(" "),
);

/** Words and tools from the user's confirmed facts, for matching against postings. */
export function profileTerms(facts: Fact[]): Set<string> {
  const terms = new Set<string>();
  for (const f of facts.filter((x) => x.confirmed)) {
    for (const w of `${f.text} ${f.title ?? ""}`.toLowerCase().split(/[^a-z0-9+#.]+/)) {
      const t = w.replace(/\.$/, "");
      if (t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t)) terms.add(t);
    }
  }
  return terms;
}

function overlap(job: ScoredJob, terms: Set<string>): { score: number; matched: string[] } {
  const words = new Set(`${job.title} ${job.description}`.toLowerCase().split(/[^a-z0-9+#.]+/));
  const matched = [...terms].filter((t) => words.has(t));
  // Diminishing returns: the 20th shared word matters less than the 3rd.
  return { score: Math.min(1, Math.log1p(matched.length) / Math.log1p(25)), matched };
}

const LEVEL_BONUS = { early: 0.35, open: 0.15, stretch: 0, senior: -1 };

function freshness(postedAt: string | null, now: number): number {
  if (!postedAt) return 0.05;
  const days = (now - Date.parse(postedAt)) / 86_400_000;
  return days < 7 ? 0.15 : days < 21 ? 0.1 : days < 45 ? 0.03 : -0.05;
}

export function buildDeck(jobs: ScoredJob[], prefs: Preferences, facts: Fact[], seen: Set<string>, now = Date.now()): Deck {
  const hidden: Record<HiddenReason, number> = { level: 0, stretch: 0, student: 0, language: 0, permit: 0, city: 0, role: 0, seen: 0 };
  const graduated = prefs.stage === "graduate" || prefs.stage === "early";
  const terms = profileTerms(facts);
  const entries: DeckEntry[] = [];
  for (const job of jobs) {
    if (seen.has(job.id)) {
      hidden.seen++;
      continue;
    }
    if (!visibleByDefault(job.seniority.level, prefs.showStretch)) {
      hidden[job.seniority.level === "stretch" ? "stretch" : "level"]++;
      continue;
    }
    // Jobs cached before the flag existed are read again here; it's one regex.
    const forStudents = job.seniority.studentOnly ?? studentOnly(job.title, job.description);
    if (forStudents && graduated) {
      hidden.student++;
      continue;
    }
    if (!speaksEnough(job.languages, prefs.languages)) {
      hidden.language++;
      continue;
    }
    const work = workFit(job.rightToWork.stance, prefs.workStatus);
    if (work === "blocked") {
      hidden.permit++;
      continue;
    }
    // "Ireland" means the board didn't name a city: keep it, it may well be yours.
    const cityOk = !prefs.cities.length || prefs.cities.includes(job.city) || job.city === "Ireland" || (job.remote && prefs.remoteOk);
    if (!cityOk) {
      hidden.city++;
      continue;
    }
    const cats = categoriesForTitle(job.title);
    const roleMatch = !prefs.roles.length || cats.some((c) => prefs.roles.includes(c));
    // A clear mismatch (a legal role for a software graduate) is hidden; an unclassified title stays, ranked lower.
    if (prefs.roles.length && cats.length && !roleMatch) {
      hidden.role++;
      continue;
    }
    const { score, matched } = overlap(job, terms);
    // Someone still studying sees the internships made for them first.
    const studentFirst = forStudents && prefs.stage === "student" ? 2 : 0;
    const rank = score + LEVEL_BONUS[job.seniority.level] + (roleMatch && cats.length ? 0.3 : 0) + freshness(job.postedAt, now) + (work === "check" ? -0.1 : 0) + (job.injections.length ? -0.05 : 0) + studentFirst;
    entries.push({ job, rank, work, matched: matched.slice(0, 8) });
  }
  entries.sort((a, b) => b.rank - a.rank);
  return { entries, hidden };
}

export const HIDDEN_COPY: Record<HiddenReason, (n: number) => string> = {
  level: (n) => `${n} asking for 3+ years or a senior title`,
  stretch: (n) => `${n} asking for about 2 years (turn on stretch roles to see them)`,
  student: (n) => `${n} open only to current students`,
  language: (n) => `${n} needing a language you didn't list`,
  permit: (n) => `${n} that rule out your right-to-work status`,
  city: (n) => `${n} in other places`,
  role: (n) => `${n} in other kinds of work`,
  seen: (n) => `${n} you've already swiped`,
};
