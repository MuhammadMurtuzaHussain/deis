// Freeze a sample of real Irish postings so the eval is repeatable: every early or
// stretch role from the employer boards plus the cached Google Jobs results, and an
// even spread of the rest for the seniority labels.
// npx tsx eval/snapshot.mts [google-jobs.json ...]
import { readFileSync, writeFileSync } from "node:fs";
import { BOARDS } from "../src/lib/jobs/registry";
import { fromGoogleJobs, mergeJobs } from "../src/lib/jobs/normalise";
import { boardJobs } from "../src/lib/server/feed";
import type { ScoredJob } from "../src/lib/jobs/types";

const jobs: ScoredJob[] = (await Promise.all(BOARDS.map(boardJobs))).flat();
for (const f of process.argv.slice(2)) for (const raw of JSON.parse(readFileSync(f, "utf8")).jobs_results ?? []) {
  const j = fromGoogleJobs(raw);
  if (j) jobs.push(j);
}
const all = mergeJobs(jobs);
const pick = (lvl: string, n: number) => all.filter((j) => j.seniority.level === lvl).slice(0, n);
const sample = [...pick("early", 30), ...pick("stretch", 15), ...pick("open", 25), ...pick("senior", 20)];
const slim = sample.map(({ id, source, title, company, location, city, description, seniority, rightToWork, languages, injections, apply, url, postedAt, remote, salary }) => ({
  id, source, title, company, location, city, remote, postedAt, salary, apply: apply.slice(0, 2), url,
  description: description.slice(0, 6000), seniority, rightToWork, languages, injections,
}));
writeFileSync("eval/data/postings.json", JSON.stringify(slim, null, 1));
console.log("saved", slim.length, "postings", Object.fromEntries(["early", "stretch", "open", "senior"].map((l) => [l, slim.filter((j) => j.seniority.level === l).length])));
