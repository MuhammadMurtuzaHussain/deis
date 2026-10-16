import { z } from "zod";
import { CATEGORIES } from "@/lib/jobs/categories";
import { body, jsonError } from "@/lib/server/api";
import { parseSerpKey, SERPAPI_HEADER } from "@/lib/serpapi";
import { buildFeed, fromHostedFeed, withOwnSearches, type FeedResult } from "@/lib/server/feed";
import { isOfflineMode } from "@/lib/server/net";
import { traceWorkflow } from "@/lib/server/telemetry";

export const runtime = "nodejs";
export const maxDuration = 60;

const ids = CATEGORIES.map((c) => c.id) as [string, ...string[]];
const schema = z.object({ categories: z.array(z.enum(ids)).max(5), includeSenior: z.boolean().default(false) });

const sleep = (ms: number) => new Promise<undefined>((r) => setTimeout(r, ms));

/**
 * The desktop app asks the hosted feed first. After 8 s, or as soon as it fails, the boards are read here too, and the first good answer wins.
 * With the user's own SerpApi key, this machine runs the Google Jobs searches itself (the key never goes to the hosted feed), so they don't
 * depend on the hosted feed's budget.
 */
async function desktopFeed(base: string, categories: string[], includeSenior: boolean, userKey: string | null): Promise<FeedResult> {
  const own = userKey ? buildFeed(categories, { includeSenior, userKey, searchesOnly: true }) : null;
  own?.catch(() => undefined);
  const feed = await (async () => {
    const hosted = fromHostedFeed(base, categories, includeSenior);
    const quick = await Promise.race([hosted, sleep(8000)]);
    if (quick) return quick;
    const local = buildFeed(categories, { includeSenior, userKey });
    if (quick === null) return local;
    local.catch(() => undefined);
    return Promise.race([hosted.then((h) => h ?? local), local]);
  })();
  return own ? withOwnSearches(feed, await own) : feed;
}

// Every Irish job from the employer boards, plus one shared Google Jobs search per role family.
// 200 with whatever is saved, flagged stale or offline; 503 only when there's nothing at all.
export async function POST(req: Request) {
  const input = await body(req, schema);
  if (input instanceof Response) return input;
  const offline = isOfflineMode();
  // The user's own SerpApi key, if they set one in Settings. Sent to serpapi.com only; never stored or logged.
  const userKey = parseSerpKey(req.headers.get(SERPAPI_HEADER));
  const feed = await traceWorkflow("job-feed", () => {
    if (offline) return buildFeed(input.categories, { includeSenior: input.includeSenior, cacheOnly: true });
    const base = process.env.DEIS_FEED_URL;
    return base ? desktopFeed(base, input.categories, input.includeSenior, userKey) : buildFeed(input.categories, { includeSenior: input.includeSenior, userKey });
  });
  const { available, ...out } = feed;
  if (!available) {
    return offline
      ? jsonError("offline", "Offline mode is on, so Deis can't fetch new jobs. The jobs saved on this device still work.", 503)
      : jsonError("feed_unreachable", "Couldn't reach any job board. Check your internet connection and try again.", 503);
  }
  return Response.json({ ...out, offline });
}
