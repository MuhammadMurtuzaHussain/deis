import { z } from "zod";
import { BOARDS, type Board } from "../jobs/registry";
import { fromAshby, fromGoogleJobs, fromGreenhouse, hashId, irishCity, mergeJobs, NOT_A_JOB, type GreenhouseJob } from "../jobs/normalise";
import { categoryById } from "../jobs/categories";
import { LANGUAGES } from "../jobs/languages";
import { sanitisePosting } from "../jobs/sanitize";
import { jobSchema, LEVELS, type ScoredJob } from "../jobs/types";
import { kvGet, kvHit, kvSet, kvSetNx } from "./kv";
import { netFetch } from "./net";
import { reportBoardFailures } from "./telemetry";

// The Irish job feed. Two kinds of source, both cached so the cost doesn't grow with users:
//   - public ATS boards (Greenhouse, Ashby): free, no key, full descriptions; fresh for 6 h
//   - Google Jobs through SerpApi: one search per role family for all of Ireland,
//     shared by every user and fresh for 48 h, with a monthly budget and a floor of
//     searches left, because the key is shared with other projects
// Stale-while-revalidate: a saved copy is served at once and refreshed in the
// background, one refresh at a time across instances. A failed refresh never
// overwrites the saved copy, and an empty list is saved only when a board is gone (404).
// Senior roles are dropped here unless asked for; the rest of the filtering
// (languages, right to work, cities) happens on the user's device.

const BOARD = { ttlSec: 7 * 86400, freshMs: 6 * 3600_000 };
const SEARCH = { ttlSec: 14 * 86400, freshMs: 48 * 3600_000 };
const LOCK_SEC = 120;
const BOARD_TIMEOUT = 30_000;
/** Under the route's maxDuration: boards still loading by then are left out of this answer. */
const FEED_DEADLINE = 45_000;
const MAX_DESCRIPTION = 8000;
const UA = { "user-agent": "Deis job feed (github.com/MuhammadMurtuzaHussain/deis)" };

const trim = (j: ScoredJob): ScoredJob => (j.description.length > MAX_DESCRIPTION ? { ...j, description: `${j.description.slice(0, MAX_DESCRIPTION)}…` } : j);

class NotFound extends Error {}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const r = await netFetch("feed", url, { signal, headers: UA });
  if (r.status === 404) throw new NotFound(`${new URL(url).host} 404`);
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
}

/** At most n at a time, in order. */
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/** Four boards load at a time in this process, whether for a request or a background refresh. */
let active = 0;
const waiting: (() => void)[] = [];
async function boardSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 4) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

// ---- Stale-while-revalidate over Key Value

type Stored = { at: number; jobs: ScoredJob[] };
type Got = { jobs: ScoredJob[] | null; at?: number; stale: boolean; how: "fresh" | "stale" | "loaded" | "none" };

const inflight = new Map<string, Promise<Stored | null>>();

function refresh(key: string, ttlSec: number, load: () => Promise<ScoredJob[]>, background: boolean): Promise<Stored | null> {
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    if (background && !(await kvSetNx(`lock:${key}`, 1, LOCK_SEC))) return null;
    try {
      const saved = { at: Date.now(), jobs: await load() };
      await kvSet(key, saved, ttlSec);
      return saved;
    } catch {
      return null;
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function swr(key: string, life: { ttlSec: number; freshMs: number }, load: (signal?: AbortSignal) => Promise<ScoredJob[]>, o: { cacheOnly?: boolean; signal?: AbortSignal }): Promise<Got> {
  const hit = await kvGet<Stored>(key);
  const fresh = Boolean(hit && Date.now() - hit.at < life.freshMs);
  if (hit && (fresh || o.cacheOnly)) return { jobs: hit.jobs, at: hit.at, stale: !fresh, how: fresh ? "fresh" : "stale" };
  if (o.cacheOnly) return { jobs: null, stale: false, how: "none" };
  if (hit) {
    // The refresh outlives this request, so it doesn't get the request's deadline.
    void refresh(key, life.ttlSec, () => load(), true);
    return { jobs: hit.jobs, at: hit.at, stale: true, how: "stale" };
  }
  const got = await refresh(key, life.ttlSec, () => load(o.signal), false);
  return got ? { jobs: got.jobs, at: got.at, stale: false, how: "loaded" } : { jobs: null, stale: false, how: "none" };
}

// ---- Employer boards

async function greenhouse(b: Board, signal: AbortSignal): Promise<ScoredJob[]> {
  const base = `https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs`;
  // The list without content is small; descriptions are fetched only for the jobs in Ireland.
  const list = ((await getJson(base, signal)) as { jobs?: GreenhouseJob[] }).jobs ?? [];
  const irish = list.filter((j) => irishCity(j.location?.name ?? "") && !NOT_A_JOB.test(j.title));
  const jobs = await pool(irish, 4, async (j) => {
    try {
      return fromGreenhouse({ ...j, ...((await getJson(`${base}/${j.id}`, signal)) as GreenhouseJob) }, b.name);
    } catch (e) {
      if (e instanceof NotFound) return null; // closed since the list was read
      throw e;
    }
  });
  return jobs.filter((j): j is ScoredJob => Boolean(j));
}

async function ashby(b: Board, signal: AbortSignal): Promise<ScoredJob[]> {
  const d = (await getJson(`https://api.ashbyhq.com/posting-api/job-board/${b.slug}?includeCompensation=true`, signal)) as { jobs?: unknown[] };
  return (d.jobs ?? []).map((j) => fromAshby(j as never, b.name)).filter((j): j is ScoredJob => Boolean(j));
}

/** Boards whose last refresh failed, reported once per failing streak. */
const failing = new Set<string>();

export function boardFeed(b: Board, o: { cacheOnly?: boolean; signal?: AbortSignal } = {}): Promise<Got> {
  const load = (outer?: AbortSignal) =>
    boardSlot(async () => {
      const signal = outer ? AbortSignal.any([outer, AbortSignal.timeout(BOARD_TIMEOUT)]) : AbortSignal.timeout(BOARD_TIMEOUT);
      try {
        const jobs = await (b.ats === "greenhouse" ? greenhouse(b, signal) : ashby(b, signal));
        failing.delete(b.slug);
        return jobs.map(trim);
      } catch (e) {
        // A board that's gone is a definite empty list; anything else keeps the saved copy.
        if (e instanceof NotFound) {
          failing.delete(b.slug);
          return [];
        }
        if (outer?.aborted) throw e; // this request ran out of time, not the board
        console.warn("[feed] board", b.slug, e instanceof Error ? e.message : e);
        if (!failing.has(b.slug)) reportBoardFailures([b.slug]);
        failing.add(b.slug);
        throw e;
      }
    });
  return swr(`board:v2:${b.ats}:${b.slug}`, BOARD, load, o);
}

/** One board's Irish jobs, for the eval scripts and the starter list. */
export async function boardJobs(b: Board): Promise<ScoredJob[]> {
  return (await boardFeed(b)).jobs ?? [];
}

// ---- Google Jobs through SerpApi

const month = () => new Date().toISOString().slice(0, 7);

/** Searches left on the SerpApi account, checked at most once an hour. The account API doesn't use a search. */
async function searchesLeft(key: string): Promise<number | null> {
  const hit = await kvGet<number>("serp:left");
  if (hit !== null) return hit;
  try {
    const d = (await getJson(`https://serpapi.com/account.json?api_key=${key}`, AbortSignal.timeout(10_000))) as { total_searches_left?: number; plan_searches_left?: number };
    const left = d.total_searches_left ?? d.plan_searches_left;
    if (typeof left !== "number") return null;
    await kvSet("serp:left", left, 3600);
    return left;
  } catch {
    return null;
  }
}

class OverBudget extends Error {}

/** One Google Jobs search, shared by everyone who picked this role family. */
export async function searchJobs(
  categoryId: string,
  o: { cacheOnly?: boolean } = {},
): Promise<{ jobs: ScoredJob[]; from: "cache" | "serpapi" | "off" | "budget" | "error" | "offline"; at?: number; stale?: boolean }> {
  const cat = categoryById(categoryId);
  const key = process.env.SERPAPI_KEY;
  if (!cat || !key) return { jobs: [], from: "off" };
  let overBudget = false;
  const got = await swr(
    `gj:v2:${hashId(cat.query)}`,
    SEARCH,
    async () => {
      try {
        // The key is shared with return-route and pizhu: leave them a floor of searches.
        const left = await searchesLeft(key);
        if (left !== null && left <= (Number(process.env.SERPAPI_FLOOR) || 40)) throw new OverBudget();
        // A daily cap too, so one bad day (or a flood of new role families) can't spend the month.
        if ((await kvHit(`serp-day:${new Date().toISOString().slice(0, 10)}`, 2 * 86400)) > (Number(process.env.SERPAPI_DAILY_BUDGET) || 20)) throw new OverBudget();
        if ((await kvHit(`serp:${month()}`, 32 * 86400)) > (Number(process.env.SERPAPI_MONTHLY_BUDGET) || 150)) throw new OverBudget();
        // gl=ie is rejected by the Google Jobs engine; the location alone keeps results in Ireland.
        const url = `https://serpapi.com/search.json?engine=google_jobs&q=${encodeURIComponent(cat.query)}&location=${encodeURIComponent("Ireland")}&hl=en&api_key=${key}`;
        const d = (await getJson(url, AbortSignal.timeout(25_000))) as { jobs_results?: unknown[]; error?: string };
        // "No results" is a real answer; any other error (bad key, out of searches) isn't.
        if (d.error && !/hasn't returned any results/i.test(d.error)) throw new Error(d.error);
        return (d.jobs_results ?? []).map((j) => fromGoogleJobs(j as never)).filter((j): j is ScoredJob => Boolean(j)).map(trim);
      } catch (e) {
        if (e instanceof OverBudget) overBudget = true;
        else console.warn("[feed] google jobs", cat.id, e instanceof Error ? e.message.replace(key, "[key]") : e);
        throw e;
      }
    },
    o,
  );
  if (got.jobs) return { jobs: got.jobs, from: got.how === "loaded" ? "serpapi" : "cache", at: got.at, stale: got.stale };
  return { jobs: [], from: o.cacheOnly ? "offline" : overBudget ? "budget" : "error" };
}

// ---- The whole feed

export type FeedSources = {
  boards: number;
  boardJobs: number;
  searches: Record<string, string>;
  searchJobs: number;
  /** Boards that couldn't be read on their last try, by name. */
  failed: string[];
  /** Senior roles dropped here, so the app can say how many it hid. */
  hiddenSenior: number;
};

/** available is false when no source answered and nothing was saved: the route says 503. */
export type FeedResult = { jobs: ScoredJob[]; sources: FeedSources; stale: boolean; savedAt?: string; available: boolean };

export async function buildFeed(categories: string[], opts: { includeSenior?: boolean; cacheOnly?: boolean } = {}): Promise<FeedResult> {
  const signal = AbortSignal.timeout(FEED_DEADLINE);
  const [boards, searches] = await Promise.all([
    Promise.all(BOARDS.map((b) => boardFeed(b, { cacheOnly: opts.cacheOnly, signal }))),
    Promise.all(categories.slice(0, 5).map(async (c) => [c, await searchJobs(c, { cacheOnly: opts.cacheOnly })] as const)),
  ]);
  const fromBoards = boards.flatMap((g) => g.jobs ?? []);
  const fromSearch = searches.flatMap(([, r]) => r.jobs);
  // Search results first so that, on a tie, the board's own copy (with the full description) wins in mergeJobs.
  const merged = mergeJobs([...fromSearch, ...fromBoards]);
  const jobs = opts.includeSenior ? merged : merged.filter((j) => j.seniority.level !== "senior");
  const times = [...boards.map((g) => g.at), ...searches.map(([, r]) => r.at)].filter((t): t is number => t !== undefined);
  return {
    jobs,
    sources: {
      boards: boards.filter((g) => g.jobs?.length).length,
      boardJobs: fromBoards.length,
      searches: Object.fromEntries(searches.map(([c, r]) => [c, r.from])),
      searchJobs: fromSearch.length,
      failed: BOARDS.filter((b, i) => (boards[i].how === "none" && !opts.cacheOnly) || failing.has(b.slug)).map((b) => b.name),
      hiddenSenior: merged.length - jobs.length,
    },
    stale: boards.some((g) => g.stale) || searches.some(([, r]) => r.stale),
    savedAt: times.length ? new Date(Math.min(...times)).toISOString() : undefined,
    available: boards.some((g) => g.jobs !== null) || searches.some(([, r]) => r.from === "cache" || r.from === "serpapi"),
  };
}

// ---- The desktop app reads the hosted feed first: it has the shared Google Jobs searches and
// a warm board cache. Its answer is checked like any other untrusted input.

const httpUrl = z.string().url().refine((u) => /^https?:\/\//i.test(u));
const hostedJob = jobSchema.extend({
  description: z.string().max(20_000),
  url: httpUrl,
  apply: z.array(z.object({ label: z.string().max(200), url: httpUrl })).max(20),
  seniority: z.object({ level: z.enum(LEVELS), yearsMin: z.number().nullable(), evidence: z.string().max(500).nullable() }),
  rightToWork: z.object({ stance: z.enum(["sponsors", "no_sponsorship", "eu_only", "right_to_work", "unknown"]), evidence: z.string().max(500).nullable() }),
  injections: z.array(z.string().max(500)).max(50),
  languages: z.array(z.array(z.enum(LANGUAGES))),
});
const hostedFeed = z.object({
  jobs: z.array(z.unknown()).max(5000),
  sources: z
    .object({ boards: z.number(), boardJobs: z.number(), searches: z.record(z.string(), z.string()), searchJobs: z.number(), failed: z.array(z.string()).optional(), hiddenSenior: z.number().optional() })
    .partial()
    .optional(),
  stale: z.boolean().optional(),
  savedAt: z.string().optional(),
});

export async function fromHostedFeed(base: string, categories: string[], includeSenior: boolean): Promise<FeedResult | null> {
  try {
    const r = await netFetch("feed-hosted", `${base.replace(/\/$/, "")}/api/feed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categories, includeSenior }),
      // A sleeping free-tier server can take ~50 s to wake; the local boards start after 8 s anyway.
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) return null;
    const d = hostedFeed.safeParse(await r.json());
    if (!d.success) return null;
    const jobs = d.data.jobs.flatMap((raw) => {
      const j = hostedJob.safeParse(raw);
      if (!j.success || (!includeSenior && j.data.seniority.level === "senior")) return [];
      // Hidden and AI-addressed text is stripped here too, whatever the server did.
      const { text, injections } = sanitisePosting(j.data.description);
      return [{ ...j.data, description: text, injections: [...new Set([...j.data.injections, ...injections])] }];
    });
    // An empty answer is a failure: the boards here may still have jobs.
    if (!jobs.length) return null;
    const s = d.data.sources ?? {};
    return {
      jobs,
      sources: { boards: s.boards ?? 0, boardJobs: s.boardJobs ?? 0, searches: s.searches ?? {}, searchJobs: s.searchJobs ?? 0, failed: s.failed ?? [], hiddenSenior: s.hiddenSenior ?? 0 },
      stale: d.data.stale ?? false,
      savedAt: d.data.savedAt,
      available: true,
    };
  } catch {
    return null;
  }
}
