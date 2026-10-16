import type { CardWhy } from "@/lib/ai/schema";
import type { DeckEntry, HiddenReason } from "@/lib/jobs/rank";
import { irishCity, jobId, score } from "@/lib/jobs/normalise";
import { sanitisePosting } from "@/lib/jobs/sanitize";
import type { ScoredJob } from "@/lib/jobs/types";
import type { PillTone } from "../ui";

// The deck's pure decisions, kept apart from React so they can be tested (tests/deck.test.ts):
// which saved jobs to show, whether a feed answer is worth saving, the swipe thresholds,
// the code-derived fit pill, the hidden-for-you bars and building a pasted job.

// ---------------------------------------------------------------------------- the feed

/** How long a fetched feed counts as fresh before the deck asks the server again. */
export const FEED_TTL_MS = 6 * 3600_000;

/** The last feed answer this device saved: which jobs it held, for which searches, and when it was asked for. */
export type FeedBatch = { ids: string[]; categories: string; hiddenSenior: number; fetchedAt: number };

export type FeedAnswer = { jobs: ScoredJob[]; stale?: boolean; offline?: boolean; savedAt?: string; sources?: { hiddenSenior?: number; searches?: Record<string, string> } };

/** Ask the server again? Only online, and only when the searches changed, the batch is old, or the user asked. */
export function shouldRefresh(batch: FeedBatch | null, categories: string, opts: { offline: boolean; force?: boolean; now?: number }): boolean {
  if (opts.offline) return false;
  if (opts.force || !batch) return true;
  return batch.categories !== categories || (opts.now ?? Date.now()) - batch.fetchedAt > FEED_TTL_MS;
}

/**
 * What to do with a feed answer. Never swap saved jobs for an empty list, and never let an
 * offline server's older copy replace what this device already has. at: when the jobs were
 * saved (the server's time for a stale or offline answer); moveSavedAt: whether "Jobs saved
 * on" should move to it (never backwards).
 */
export function feedUpdate(prevSavedAt: number | null, out: FeedAnswer, now = Date.now()): { save: false } | { save: true; at: number; moveSavedAt: boolean } {
  if (!out.jobs.length) return { save: false };
  const told = out.savedAt ? Date.parse(out.savedAt) : NaN;
  const at = (out.stale || out.offline) && Number.isFinite(told) ? told : now;
  if (out.offline && prevSavedAt != null && prevSavedAt >= at) return { save: false };
  return { save: true, at, moveSavedAt: prevSavedAt == null || at >= prevSavedAt };
}

/**
 * The jobs the deck ranks: the last saved batch plus everything pasted by hand. With no batch
 * (or one whose jobs were pruned), every saved job, so an offline device shows all it has.
 */
export function pickJobs<T extends Pick<ScoredJob, "id" | "source">>(rows: T[], batchIds: string[] | null): T[] {
  if (batchIds?.length) {
    const want = new Set(batchIds);
    const picked = rows.filter((r) => want.has(r.id) || r.source === "pasted");
    if (picked.some((r) => r.source !== "pasted")) return picked;
  }
  return rows;
}

/**
 * Pasted jobs the user hasn't swiped go on top, newest first, whatever the filters say:
 * they asked for these by hand. Everything else keeps the ranking from buildDeck().
 */
export function pastedFirst(entries: DeckEntry[], pasted: (ScoredJob & { savedAt: number })[], seen: Set<string>, toEntry: (job: ScoredJob) => DeckEntry): DeckEntry[] {
  const top = pasted
    .filter((j) => !seen.has(j.id))
    .sort((a, b) => b.savedAt - a.savedAt)
    .map((j) => entries.find((e) => e.job.id === j.id) ?? toEntry(j));
  const ids = new Set(top.map((e) => e.job.id));
  return [...top, ...entries.filter((e) => !ids.has(e.job.id))];
}

// ---------------------------------------------------------------------------- swiping

export type Dir = "apply" | "skip" | "save";

export const SWIPE = { threshold: 92, steps: 6, flick: 520 } as const;

/** Drag progress as a step from 0 to steps, so the stamps and the card underneath move in clear notches. */
export function quantise(dx: number, threshold: number = SWIPE.threshold, steps: number = SWIPE.steps): { dir: -1 | 1 | 0; step: number } {
  if (Math.abs(dx) < 1) return { dir: 0, step: 0 };
  return { dir: dx > 0 ? 1 : -1, step: Math.min(steps, Math.floor((Math.abs(dx) / threshold) * steps)) };
}

/** Let go of a drag: far enough, or a quick flick a third of the way, decides; anything less snaps back. */
export function release(dx: number, vx: number, threshold: number = SWIPE.threshold, flick: number = SWIPE.flick): Dir | null {
  const far = Math.abs(dx) >= threshold;
  const flicked = Math.abs(vx) >= flick && Math.abs(dx) >= 0.35 * threshold && Math.sign(vx) === Math.sign(dx);
  if (!far && !flicked) return null;
  return dx > 0 ? "apply" : "skip";
}

// ---------------------------------------------------------------------------- the fit pill

export type FitPill = { tone: PillTone; label: string };

/**
 * A pill worked out by code from the "how you match" lines that survived the guard (a strong
 * line must cite a confirmed fact). Gemma's own score is never shown.
 */
export function fitPill(why: CardWhy["why"] | null | undefined): FitPill | null {
  if (!why?.length) return null;
  const strong = why.filter((w) => w.kind === "strong").length;
  const carries = why.filter((w) => w.kind === "transferable").length;
  if (strong >= 2) return { tone: "go", label: "Strong match" };
  if (strong + carries >= 2) return { tone: "neutral", label: "Good match" };
  return { tone: "ochre", label: "Some gaps" };
}

// ---------------------------------------------------------------------------- hidden for you

export type HiddenBar = { key: HiddenReason | "senior"; label: string; value: number; tone: PillTone };

/**
 * The hidden-for-you bars. senior: what the server hid before the jobs arrived (hiddenSenior)
 * plus any the deck hid itself. Stretch roles ask for about 2 years, not 3 (PRD-X2).
 */
export function hiddenBars(hidden: Record<HiddenReason, number>, serverSenior = 0): HiddenBar[] {
  const bars: HiddenBar[] = [
    { key: "senior", label: "Need 3 or more years, or a senior title", value: serverSenior + hidden.level, tone: "neutral" },
    { key: "stretch", label: "Ask for about 2 years", value: hidden.stretch, tone: "ochre" },
    { key: "student", label: "Open only to current students", value: hidden.student, tone: "neutral" },
    { key: "permit", label: "Rule out your right-to-work status", value: hidden.permit, tone: "brick" },
    { key: "language", label: "Need a language you didn't list", value: hidden.language, tone: "neutral" },
    { key: "city", label: "In other places", value: hidden.city, tone: "neutral" },
    { key: "role", label: "In other kinds of work", value: hidden.role, tone: "neutral" },
  ];
  return bars.filter((b) => b.value > 0);
}

// ---------------------------------------------------------------------------- paste a job

/** The server reads at most this much of a posting (jobInputSchema in src/lib/server/api.ts). */
export const MAX_POSTING = 12_000;

export type PastedInput = { title: string; company: string; location: string; text: string; link?: string };

/** "https://…" only; anything else is not a link Deis will open. */
export function cleanLink(raw: string | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Clip on a word boundary with an ellipsis. */
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.8 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * A job typed or pasted by the user, built in the browser with the same code as the boards:
 * the posting is sanitised (hidden and AI-addressed text set aside and shown on the card),
 * then seniority, right to work and languages are read from it. No network needed.
 */
export function buildPastedJob(input: PastedInput): { job: ScoredJob; clipped: boolean } {
  const title = input.title.trim().slice(0, 300);
  const company = input.company.trim().slice(0, 200);
  const location = input.location.trim().slice(0, 300) || "Ireland";
  const place = irishCity(location);
  const city = (place?.city ?? location).slice(0, 80);
  const remote = place?.remote ?? /\bremote\b/i.test(location);
  const { text, injections } = sanitisePosting(input.text);
  const clipped = text.length > MAX_POSTING;
  const link = cleanLink(input.link);
  const job = score(
    {
      id: jobId(company, title, city),
      source: "pasted",
      title,
      company,
      location,
      city,
      remote,
      postedAt: null,
      description: clip(text, MAX_POSTING),
      salary: null,
      apply: link ? [{ label: company || "The posting", url: link }] : [],
      // Job.url is required by the type; a pasted job with no link has none to open.
      url: link ?? "",
    },
    injections,
  );
  return { job, clipped };
}
