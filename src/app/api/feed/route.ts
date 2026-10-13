import { z } from "zod";
import { CATEGORIES } from "@/lib/jobs/categories";
import { body } from "@/lib/server/api";
import { buildFeed } from "@/lib/server/feed";
import { traceWorkflow } from "@/lib/server/telemetry";

export const runtime = "nodejs";
export const maxDuration = 60;

const ids = CATEGORIES.map((c) => c.id) as [string, ...string[]];
const schema = z.object({ categories: z.array(z.enum(ids)).max(5), includeSenior: z.boolean().default(false) });

// Every Irish job from the employer boards, plus one shared Google Jobs search per role family.
export async function POST(req: Request) {
  const input = await body(req, schema);
  if (input instanceof Response) return input;
  const feed = await traceWorkflow("job-feed", () => buildFeed(input.categories, { includeSenior: input.includeSenior }));
  return Response.json(feed);
}
