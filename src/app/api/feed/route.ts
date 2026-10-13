import { z } from "zod";
import { CATEGORIES } from "@/lib/jobs/categories";
import type { ScoredJob } from "@/lib/jobs/types";
import { body } from "@/lib/server/api";
import { buildFeed, type FeedResult } from "@/lib/server/feed";
import { traceWorkflow } from "@/lib/server/telemetry";

export const runtime = "nodejs";
export const maxDuration = 60;

const ids = CATEGORIES.map((c) => c.id) as [string, ...string[]];
const schema = z.object({ categories: z.array(z.enum(ids)).max(5), includeSenior: z.boolean().default(false) });

/** The desktop app asks the hosted feed (it holds the shared Google Jobs searches) and reads the boards itself if that fails. */
async function fromHostedFeed(categories: string[], includeSenior: boolean): Promise<FeedResult | null> {
  const base = process.env.DEIS_FEED_URL;
  if (!base) return null;
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/api/feed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ categories, includeSenior }),
      // A sleeping free-tier server can take ~50 s to wake; the local boards are already loading meanwhile.
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { jobs?: ScoredJob[]; sources?: FeedResult["sources"] };
    return d.jobs ? { jobs: d.jobs, sources: d.sources ?? { boards: 0, boardJobs: 0, searches: {}, searchJobs: 0 } } : null;
  } catch {
    return null;
  }
}

// Every Irish job from the employer boards, plus one shared Google Jobs search per role family.
export async function POST(req: Request) {
  const input = await body(req, schema);
  if (input instanceof Response) return input;
  const feed = await traceWorkflow("job-feed", async () => {
    // Desktop: start reading the employer boards now, so a slow or missing hosted feed costs nothing extra.
    const local = buildFeed(input.categories, { includeSenior: input.includeSenior });
    local.catch(() => undefined);
    return (await fromHostedFeed(input.categories, input.includeSenior)) ?? (await local);
  });
  return Response.json(feed);
}
