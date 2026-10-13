// A second sample the classifier was never tuned on: postings not in eval/data/postings.json.
// Prints title + experience lines WITHOUT the code's verdict, for blind labelling.
import { readFileSync, writeFileSync } from "node:fs";
import { BOARDS } from "../src/lib/jobs/registry";
import { boardJobs } from "../src/lib/server/feed";

const seen = new Set((JSON.parse(readFileSync("eval/data/postings.json", "utf8")) as { id: string }[]).map((p) => p.id));
const fresh = (await Promise.all(BOARDS.map(boardJobs))).flat().filter((j) => !seen.has(j.id));
// Every 4th unseen posting, so the sample spreads across employers and levels.
const sample = fresh.filter((_, i) => i % 4 === 0).slice(0, 44);
writeFileSync("eval/data/holdout.json", JSON.stringify(sample.map(({ id, title, company, description }) => ({ id, title, company, description: description.slice(0, 6000) })), null, 1));
sample.forEach((j, i) => {
  const lines = [...j.description.matchAll(/[^.\n]{0,60}\b(\d{1,2}|one|two|three|four|five)\s*\+?\s*(?:-|–|to)?\s*\d*\s*(?:years?|yrs)[^.\n]{0,50}/gi)].map((m) => m[0].trim()).slice(0, 3);
  const grad = /recent graduates?|graduate programme|new grads?|entry[- ]level|no (prior )?experience/i.exec(j.description)?.[0];
  console.log(`${String(i).padStart(2)} | ${j.title.slice(0, 64).padEnd(64)} | ${grad ? `[${grad}] ` : ""}${lines.join(" || ").slice(0, 200)}`);
});
