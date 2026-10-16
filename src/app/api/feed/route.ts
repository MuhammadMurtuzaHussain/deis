import { z } from "zod";
import { CATEGORIES } from "@/lib/jobs/categories";
import { body, jsonError } from "@/lib/server/api";
import { buildFeed, fromHostedFeed, type FeedResult } from "@/lib/server/feed";
import { isOfflineMode } from "@/lib/server/net";
import { traceWorkflow } from "@/lib/server/telemetry";

export const runtime = "nodejs";
export const maxDuration = 60;

const ids = CATEGORIES.map((c) => c.id) as [string, ...string[]];
const schema = z.object({ categories: z.array(z.enum(ids)).max(5), includeSenior: z.boolean().default(false) });

const sleep = (ms: number) => new Promise<undefined>((r) => setTimeout(r, ms));

/** The desktop app asks the hosted feed first. After 8 s, or as soon as it fails, the boards are read here too, and the first good answer wins. */
async function desktopFeed(base: string, categories: string[], includeSenior: boolean): Promise<FeedResult> {
  const hosted = fromHostedFeed(base, categories, includeSenior);
  const quick = await Promise.race([hosted, sleep(8000)]);
  if (quick) return quick;
  const local = buildFeed(categories, { includeSenior });
  if (quick === null) return local;
  local.catch(() => undefined);
  return Promise.race([hosted.then((h) => h ?? local), local]);
}

// Every Irish job from the employer boards, plus one shared Google Jobs search per role family.
// 200 with whatever is saved, flagged stale or offline; 503 only when there's nothing at all.
export async function POST(req: Request) {
  const input = await body(req, schema);
  if (input instanceof Response) return input;
  const offline = isOfflineMode();
  const feed = await traceWorkflow("job-feed", () => {
    if (offline) return buildFeed(input.categories, { includeSenior: input.includeSenior, cacheOnly: true });
    const base = process.env.DEIS_FEED_URL;
    return base ? desktopFeed(base, input.categories, input.includeSenior) : buildFeed(input.categories, { includeSenior: input.includeSenior });
  });
  const { available, ...out } = feed;
  if (!available) {
    return offline
      ? jsonError("offline", "Offline mode is on, so Deis can't fetch new jobs. The jobs saved on this device still work.", 503)
      : jsonError("feed_unreachable", "Couldn't reach any job board. Check your internet connection and try again.", 503);
  }
  return Response.json({ ...out, offline });
}
