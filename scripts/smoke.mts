// Smoke test: one real Irish posting, one persona, the whole kit, on whatever model the env picks.
// pnpm tsx scripts/smoke.mts [ollama|google] [persona]
import { BOARDS } from "../src/lib/jobs/registry";
import { fromGreenhouse } from "../src/lib/jobs/normalise";
import { PERSONAS, type PersonaId } from "../src/lib/demo/personas";
import { modelChain } from "../src/mastra/model";
import { structured } from "../src/mastra/gemma";
import { cardPrompt, cvPrompt, fitPrompt } from "../src/lib/ai/prompts";
import { cardSchema } from "../src/lib/ai/schema";
import { cvBodySchema, fitSchema } from "../src/lib/cv/schema";
import { guardCv, guardFit, ledger } from "../src/lib/cv/guard";

const which = process.argv[2] ?? "ollama";
const persona = PERSONAS[(process.argv[3] ?? "aoife") as PersonaId];
const settings = which === "google" ? { provider: "google" as const, apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!, model: "gemma-4-26b-a4b-it" } : { provider: "ollama" as const, baseUrl: "http://127.0.0.1:11434/api", model: "gemma4:e4b" };
const board = BOARDS.find((b) => b.slug === "stripe")!;
const d = await (await fetch(`https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs?content=true`)).json();
const job = d.jobs.map((j: never) => fromGreenhouse(j, board.name)).find((j: { title: string } | null) => j && /new grad/i.test(j.title));
console.log("JOB:", job.title, "|", job.city, "|", job.seniority.level, "|", job.description.length, "chars");
const l = ledger(persona.facts, persona.neverClaim);

const t0 = Date.now();
const card = await structured("card", "cardAgent", modelChain(settings), cardPrompt(job, persona.facts), cardSchema, { maxOutputTokens: 600 });
console.log("\nCARD", card.usage, JSON.stringify(card.data, null, 1));
const fit = await structured("fit", "fitAgent", modelChain(settings, "careful"), fitPrompt(job, persona.facts), fitSchema, { maxOutputTokens: 1500 });
const gf = guardFit(fit.data, l);
console.log("\nFIT", fit.usage, gf.fit.verdict, gf.fit.angle); for (const r of gf.fit.requirements) console.log(`  ${r.match.padEnd(12)} ${r.need} [${r.facts}]`); console.log("  fit events", gf.events);
const cv = await structured("cv", "cvAgent", modelChain(settings, "careful"), cvPrompt(job, gf.fit, persona.facts, persona.neverClaim), cvBodySchema, { maxOutputTokens: 3000 });
console.log("RAW CITES", JSON.stringify(cv.data.roles.map((r) => r.bullets.map((b) => b.facts))), JSON.stringify(cv.data.summary.map((s) => s.facts)));
const g = guardCv(cv.data, l);
console.log("\nCV", cv.usage);
console.log(JSON.stringify(g.body, null, 1));
console.log("\nGUARD EVENTS", g.events);
console.log("\nTOTAL", ((Date.now() - t0) / 1000).toFixed(1), "s; tokens in", card.usage.inputTokens + fit.usage.inputTokens + cv.usage.inputTokens, "out", card.usage.outputTokens + fit.usage.outputTokens + cv.usage.outputTokens);

// Send the traces still buffered (Mastra Platform batches every 5 s) before the script exits.
const { mastra } = await import("../src/mastra");
await mastra.shutdown();
