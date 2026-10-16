// Calls the running dev server like the app does: feed → fit → kit, for one persona.
// pnpm tsx scripts/api-smoke.mts [ollama|google|demo] [aoife|rahul] [title regex]
import { encodeSettings, type AiSettings } from "../src/lib/ai/settings";
import { cvText } from "../src/lib/cv/compose";
import { PERSONAS, type PersonaId } from "../src/lib/demo/personas";

const base = process.env.BASE ?? "http://localhost:3200";
const which = process.argv[2] ?? "ollama";
const p = PERSONAS[(process.argv[3] ?? "aoife") as PersonaId];
const pick = new RegExp(process.argv[4] ?? "graduate", "i");
const settings: AiSettings =
  which === "ollama" ? { provider: "ollama", baseUrl: "http://127.0.0.1:11434/api", model: "gemma4:e4b" } : which === "google" ? { provider: "google", apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!, model: "gemma-4-26b-a4b-it" } : { provider: "demo" };
const headers = { "content-type": "application/json", "x-deis-ai": encodeSettings(settings) };
const post = async (path: string, body: unknown) => {
  const t = Date.now();
  const r = await fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
  const d = await r.json();
  console.log(`\n${path} ${r.status} ${((Date.now() - t) / 1000).toFixed(1)}s`);
  return d;
};
const feed = await post("/api/feed", { categories: p === PERSONAS.rahul ? ["data"] : ["software"] });
const job = feed.jobs.find((j: { title: string }) => pick.test(j.title));
console.log("JOB", job.title, "|", job.company, "|", job.city, "|", job.seniority.level, job.rightToWork.stance);
const card = await post("/api/card", { job, facts: p.facts, neverClaim: p.neverClaim });
console.log(card);
const fit = await post("/api/fit", { job, facts: p.facts, neverClaim: p.neverClaim });
if (!fit.fit) { console.log(fit); process.exit(1); }
console.log(fit.fit.verdict, "|", fit.fit.angle); for (const r of fit.fit.requirements) console.log(`  ${r.match.padEnd(12)} ${r.need} [${r.facts}]`);
const kit = await post("/api/kit", { job, profile: p, fit: fit.fit, include: { letter: true, answers: true } });
if (!kit.cv) { console.log(kit); process.exit(1); }
// The CV as the app renders it (old and new kit shapes go through the same sections).
console.log("CV KEYS", Object.keys(kit.cv).join(", "), "| guardVersion", kit.guardVersion);
console.log(cvText(kit.cv));
console.log("LETTER", kit.letter?.paragraphs.map((x: { text: string }) => x.text.slice(0, 160)));
console.log("ANSWERS", kit.answers?.answers.map((a: { question: string; answer: string; needsYou: boolean }) => `${a.question} → ${a.needsYou ? "(you)" : a.answer.slice(0, 120)}`));
console.log("EVENTS", kit.events.map((e: { rule: string; text: string }) => `${e.rule}: ${e.text.slice(0, 90)}`));
console.log("USAGE", kit.usage, kit.model, "errors", kit.errors, "repairs", kit.repairs?.length);
