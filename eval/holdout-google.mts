// Held-out Google Jobs postings (never used for tuning), printed for blind labelling.
import { readFileSync, writeFileSync } from "node:fs";
import { fromGoogleJobs } from "../src/lib/jobs/normalise";
const out: { id: string; title: string; company: string; description: string }[] = [];
for (const f of process.argv.slice(2)) for (const raw of JSON.parse(readFileSync(f, "utf8")).jobs_results ?? []) {
  const j = fromGoogleJobs(raw);
  if (j) out.push({ id: j.id, title: j.title, company: j.company, description: j.description.slice(0, 6000) });
}
writeFileSync("eval/data/holdout-google.json", JSON.stringify(out, null, 1));
out.forEach((j, i) => {
  const lines = [...j.description.matchAll(/[^.\n]{0,60}\b(\d{1,2}|one|two|three|four|five)\s*\+?\s*(?:-|–|to)?\s*\d*\s*(?:years?|yrs)[^.\n]{0,50}/gi)].map((m) => m[0].trim()).slice(0, 3);
  const grad = /recent graduates?|graduate programme|new grads?|entry[- ]level|no (prior )?experience/i.exec(j.description)?.[0];
  console.log(`${String(i).padStart(2)} | ${j.title.slice(0, 64).padEnd(64)} | ${grad ? `[${grad}] ` : ""}${lines.join(" || ").slice(0, 200)}`);
});
