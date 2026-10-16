// Starter jobs for an offline first run: every Irish job on the employer boards, saved as
// public/starter-jobs.json for the app to load when it has nothing else. Boards only:
// no SerpApi (Google Jobs) results, which aren't ours to hand out. Descriptions are
// sanitised (as on every board read) and trimmed, and senior roles are left out.
//
//   npx tsx scripts/feed-snapshot.mts                  # writes public/starter-jobs.json
//   npx tsx scripts/feed-snapshot.mts --out /tmp/x.json
//
// Run by .github/workflows/desktop.yml before each installer build.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BOARDS } from "../src/lib/jobs/registry";
import { mergeJobs } from "../src/lib/jobs/normalise";
import type { ScoredJob } from "../src/lib/jobs/types";
import { boardFeed } from "../src/lib/server/feed";

const MAX_DESCRIPTION = 4000;
const outArg = process.argv.indexOf("--out");
const out = outArg > 0 ? process.argv[outArg + 1] : "public/starter-jobs.json";

const results = await Promise.all(BOARDS.map(async (b) => [b, await boardFeed(b)] as const));
const failed = results.filter(([, g]) => g.jobs === null).map(([b]) => b.name);
const trim = (j: ScoredJob): ScoredJob => (j.description.length > MAX_DESCRIPTION ? { ...j, description: `${j.description.slice(0, MAX_DESCRIPTION)}…` } : j);
const jobs = mergeJobs(results.flatMap(([, g]) => g.jobs ?? []))
  .filter((j) => j.seniority.level !== "senior")
  .map(trim);

if (!jobs.length) {
  console.error("No jobs from any board; not writing", out);
  process.exit(1);
}

// The shape the app reads: when the list was made, and the jobs, as /api/feed sends them.
const snapshot = { savedAt: new Date().toISOString(), source: "boards", jobs };
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(snapshot));
const kb = Math.round(Buffer.byteLength(JSON.stringify(snapshot)) / 1024);
console.log(`${jobs.length} jobs from ${BOARDS.length - failed.length} of ${BOARDS.length} boards, ${kb} KB, in ${out}`);
if (failed.length) console.log("Couldn't read:", failed.join(", "));
process.exit(0);
