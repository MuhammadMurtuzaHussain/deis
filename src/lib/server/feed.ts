import { BOARDS, type Board } from "../jobs/registry";
import { fromAshby, fromGoogleJobs, fromGreenhouse, hashId, mergeJobs } from "../jobs/normalise";
import { categoryById } from "../jobs/categories";
import type { ScoredJob } from "../jobs/types";
import { kvGet, kvHit, kvSet } from "./kv";

// The Irish job feed. Two kinds of source, both cached so the cost doesn't grow with users:
//   - public ATS boards (Greenhouse, Ashby): free, no key, full descriptions; cached 6 h
//   - Google Jobs through SerpApi: one search per role family for all of Ireland,
//     shared by every user and cached 48 h, with a monthly budget so the free
//     plan (250 searches) never runs dry mid-month
// Senior roles are dropped here unless asked for; the rest of the filtering
// (languages, right to work, cities) happens on the user's device.

const BOARD_TTL = 6 * 3600;
const SEARCH_TTL = 48 * 3600;
const FAILED_TTL = 3600;
const MAX_DESCRIPTION = 8000;

const trim = (j: ScoredJob): ScoredJob => (j.description.length > MAX_DESCRIPTION ? { ...j, description: `${j.description.slice(0, MAX_DESCRIPTION)}…` } : j);

async function getJson(url: string, timeoutMs = 15000): Promise<unknown> {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "Deis job feed (github.com/MuhammadMurtuzaHussain/deis)" } });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
}

export async function boardJobs(b: Board): Promise<ScoredJob[]> {
  const key = `board:v1:${b.ats}:${b.slug}`;
  const hit = await kvGet<ScoredJob[]>(key);
  if (hit) return hit;
  try {
    const jobs =
      b.ats === "greenhouse"
        ? (((await getJson(`https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs?content=true`)) as { jobs?: unknown[] }).jobs ?? []).map((j) => fromGreenhouse(j as never, b.name))
        : (((await getJson(`https://api.ashbyhq.com/posting-api/job-board/${b.slug}?includeCompensation=true`)) as { jobs?: unknown[] }).jobs ?? []).map((j) => fromAshby(j as never, b.name));
    const irish = jobs.filter((j): j is ScoredJob => Boolean(j)).map(trim);
    await kvSet(key, irish, BOARD_TTL);
    return irish;
  } catch (e) {
    console.warn("[feed] board", b.slug, e instanceof Error ? e.message : e);
    await kvSet(key, [], FAILED_TTL);
    return [];
  }
}

const month = () => new Date().toISOString().slice(0, 7);

/** One Google Jobs search, shared by everyone who picked this role family. */
export async function searchJobs(categoryId: string): Promise<{ jobs: ScoredJob[]; from: "cache" | "serpapi" | "off" | "budget" | "error" }> {
  const cat = categoryById(categoryId);
  const key = process.env.SERPAPI_KEY;
  if (!cat || !key) return { jobs: [], from: "off" };
  const cacheKey = `gj:v1:${hashId(cat.query)}`;
  const hit = await kvGet<ScoredJob[]>(cacheKey);
  if (hit) return { jobs: hit, from: "cache" };

  const budget = Number(process.env.SERPAPI_MONTHLY_BUDGET) || 220;
  if ((await kvHit(`serp:${month()}`, 32 * 86400)) > budget) return { jobs: [], from: "budget" };

  try {
    // gl=ie is rejected by the Google Jobs engine; the location alone keeps results in Ireland.
    const url = `https://serpapi.com/search.json?engine=google_jobs&q=${encodeURIComponent(cat.query)}&location=${encodeURIComponent("Ireland")}&hl=en&api_key=${key}`;
    const d = (await getJson(url, 25000)) as { jobs_results?: unknown[]; error?: string };
    if (d.error) throw new Error(d.error);
    const jobs = (d.jobs_results ?? []).map((j) => fromGoogleJobs(j as never)).filter((j): j is ScoredJob => Boolean(j)).map(trim);
    await kvSet(cacheKey, jobs, SEARCH_TTL);
    return { jobs, from: "serpapi" };
  } catch (e) {
    console.warn("[feed] google jobs", cat.id, e instanceof Error ? e.message.replace(key, "[key]") : e);
    await kvSet(cacheKey, [], FAILED_TTL);
    return { jobs: [], from: "error" };
  }
}

async function inBatches<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

export type FeedResult = {
  jobs: ScoredJob[];
  sources: { boards: number; boardJobs: number; searches: Record<string, string>; searchJobs: number };
};

export async function buildFeed(categories: string[], opts: { includeSenior?: boolean } = {}): Promise<FeedResult> {
  const [boards, searches] = await Promise.all([
    inBatches(BOARDS, 8, boardJobs),
    Promise.all(categories.slice(0, 5).map(async (c) => [c, await searchJobs(c)] as const)),
  ]);
  const fromBoards = boards.flat();
  const fromSearch = searches.flatMap(([, r]) => r.jobs);
  // Search results first so that, on a tie, the board's own copy (with the full description) wins in mergeJobs.
  const merged = mergeJobs([...fromSearch, ...fromBoards]);
  const jobs = opts.includeSenior ? merged : merged.filter((j) => j.seniority.level !== "senior");
  return {
    jobs,
    sources: {
      boards: boards.filter((b) => b.length).length,
      boardJobs: fromBoards.length,
      searches: Object.fromEntries(searches.map(([c, r]) => [c, r.from])),
      searchJobs: fromSearch.length,
    },
  };
}
