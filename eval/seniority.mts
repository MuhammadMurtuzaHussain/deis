// Seniority eval: the deck's code-only filter against hand labels on 81 real Irish
// postings (eval/data). What matters to a user is visibility: shown, labelled stretch,
// or hidden. npx tsx eval/seniority.mts
import { readFileSync } from "node:fs";
import { classifySeniority } from "../src/lib/jobs/seniority";

type Posting = { id: string; title: string; description: string };
type Label = { id: string; title: string; label: "show" | "stretch" | "hide"; why: string };
// Pass "holdout" to score the sets the classifier was never tuned on.
const holdout = process.argv[2] === "holdout";
const read = (f: string) => JSON.parse(readFileSync(`eval/data/${f}`, "utf8"));
const postings: Posting[] = holdout ? [...read("holdout.json"), ...read("holdout-google.json")] : read("postings.json");
const labels: Label[] = read(holdout ? "holdout-labels.json" : "seniority-labels.json");
const visibility = { early: "show", open: "show", stretch: "stretch", senior: "hide" } as const;

let right = 0;
const confusion: Record<string, number> = {};
const wrong: string[] = [];
for (const l of labels) {
  const p = postings.find((x) => x.id === l.id)!;
  const s = classifySeniority(p.title, p.description);
  const got = visibility[s.level];
  confusion[`${l.label}→${got}`] = (confusion[`${l.label}→${got}`] ?? 0) + 1;
  if (got === l.label) right++;
  else wrong.push(`  ${l.title} | label ${l.label} (${l.why}) | code ${got}: ${s.evidence ?? "no evidence"}`);
}
console.log(`Seniority (${holdout ? "held out" : "tuning set"}): ${right}/${labels.length} right (${((100 * right) / labels.length).toFixed(1)}%)`);
console.log("label→code:", confusion);
// The costly error is hiding a job someone could get; showing a senior one only wastes a swipe.
console.log("Jobs wrongly hidden:", wrong.filter((w) => w.includes("code hide")).length);
if (wrong.length) console.log(wrong.join("\n"));
