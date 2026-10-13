// Scratch check: pull every registry board plus a saved Google Jobs response and print what the filters decide.
import { readFileSync } from "node:fs";
import { BOARDS } from "../src/lib/jobs/registry";
import { fromAshby, fromGoogleJobs, fromGreenhouse, mergeJobs } from "../src/lib/jobs/normalise";
import type { ScoredJob } from "../src/lib/jobs/types";

const jobs: ScoredJob[] = [];
await Promise.all(
  BOARDS.map(async (b) => {
    const url = b.ats === "greenhouse" ? `https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs?content=true` : `https://api.ashbyhq.com/posting-api/job-board/${b.slug}?includeCompensation=true`;
    const r = await fetch(url).catch(() => null);
    if (!r?.ok) return console.log("FAIL", b.slug);
    const d = await r.json();
    for (const raw of d.jobs ?? []) {
      const j = b.ats === "greenhouse" ? fromGreenhouse(raw, b.name) : fromAshby(raw, b.name);
      if (j) jobs.push(j);
    }
  }),
);
const gj = JSON.parse(readFileSync(process.argv[2], "utf8"));
for (const raw of gj.jobs_results ?? []) { const j = fromGoogleJobs(raw); if (j) jobs.push(j); }
const merged = mergeJobs(jobs);
const by: Record<string, number> = {};
for (const j of merged) by[j.seniority.level] = (by[j.seniority.level] ?? 0) + 1;
console.log("total", jobs.length, "merged", merged.length, by);
for (const lvl of (process.argv[3] ?? "early,stretch,open").split(",")) {
  console.log(`\n== ${lvl}`);
  for (const j of merged.filter((x) => x.seniority.level === lvl).slice(0, lvl === "open" ? 25 : 40))
    console.log(`- ${j.title} | ${j.company} | ${j.city} | ${j.seniority.evidence?.slice(0, 70) ?? ""} | rtw:${j.rightToWork.stance}${j.injections.length ? " | INJ:" + j.injections[0].slice(0, 60) : ""}`);
}
const rtw: Record<string, number> = {};
for (const j of merged) rtw[j.rightToWork.stance] = (rtw[j.rightToWork.stance] ?? 0) + 1;
console.log("\nright to work", rtw);
for (const j of merged.filter((x) => x.rightToWork.stance !== "unknown").slice(0, 8)) console.log(`  ${j.rightToWork.stance}: ${j.rightToWork.evidence?.slice(0, 120)}`);
console.log("injections", merged.filter((j) => j.injections.length).map((j) => `${j.company}: ${j.injections[0].slice(0, 100)}`));
