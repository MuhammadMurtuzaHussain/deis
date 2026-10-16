// Jobs per demo persona at each stage, fetch → deck: pnpm tsx scripts/deck-count.mts [http://localhost:3200]
import { PERSONAS } from "../src/lib/demo/personas";
import { buildDeck } from "../src/lib/jobs/rank";
import type { ScoredJob } from "../src/lib/jobs/types";

const base = process.argv[2] ?? "http://localhost:3200";
for (const [id, p] of Object.entries(PERSONAS)) {
  const t = Date.now();
  const r = await fetch(`${base}/api/feed`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ categories: [...p.preferences.roles].sort(), includeSenior: false }) });
  const d = (await r.json()) as { jobs: ScoredJob[]; sources: Record<string, unknown> };
  const deck = buildDeck(d.jobs, p.preferences, p.facts, new Set());
  const src: Record<string, number> = {};
  for (const e of deck.entries) src[e.job.source] = (src[e.job.source] ?? 0) + 1;
  console.log(id, `${Date.now() - t}ms`, JSON.stringify({ ...d.sources, served: d.jobs.length, deck: deck.entries.length, deckBySource: src, hidden: deck.hidden }));
}
