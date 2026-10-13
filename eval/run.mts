// Guard eval: run the real fit check and kit workflow for each demo persona against
// early-career postings from the snapshot, on one model tier, and measure:
//   - what Gemma wrote that the guard removed, by rule (its attempts to over-claim)
//   - an independent re-check of the finished CV and letter: every number, tool and
//     certificate must appear somewhere in the persona's confirmed facts (expect 0)
//   - time and tokens per kit, for the cost table
// npx tsx --env-file=.env.local eval/run.mts [ollama|google|demo] [kits per persona]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { RequestContext } from "@mastra/core/request-context";
import { mastra } from "../src/mastra";
import { modelChain } from "../src/mastra/model";
import { structured } from "../src/mastra/gemma";
import { fitPrompt } from "../src/lib/ai/prompts";
import { fitSchema } from "../src/lib/cv/schema";
import { CERTS, guardFit, ledger, TOOLS, type GuardEvent } from "../src/lib/cv/guard";
import { PERSONAS, type PersonaId } from "../src/lib/demo/personas";
import { categoriesForTitle } from "../src/lib/jobs/categories";
import type { ScoredJob } from "../src/lib/jobs/types";
import type { AiSettings } from "../src/lib/ai/settings";
import type { Kit } from "../src/mastra/workflows/kit";

const tier = process.argv[2] ?? "ollama";
const perPersona = Number(process.argv[3] ?? 3);
const settings: AiSettings =
  tier === "google"
    ? { provider: "google", apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!, model: "gemma-4-26b-a4b-it" }
    : tier === "demo"
      ? { provider: "demo" }
      : { provider: "ollama", baseUrl: "http://127.0.0.1:11434/api", model: "gemma4:e4b" };

const postings: ScoredJob[] = JSON.parse(readFileSync("eval/data/postings.json", "utf8"));
const early = postings.filter((p) => p.seniority.level === "early" || p.seniority.level === "open");

const TOOL_RE = new RegExp(`(?<![\\w.+#])(${TOOLS.join("|")})(?![\\w+#])`, "g");
const CERT_RE = new RegExp(`(?<![\\w+])(${CERTS.join("|")})(?![\\w+])`, "gi");

/** Independent of the guard: anything checkable in the final text that no confirmed fact contains. */
function untraceable(text: string, factsText: string): string[] {
  const src = factsText.toLowerCase().replace(/,/g, "");
  const bad: string[] = [];
  for (const m of text.matchAll(/(?<![\w.])\d[\d,]*(?:\.\d+)?/g)) if (!src.includes(m[0].replace(/,/g, ""))) bad.push(m[0]);
  for (const m of text.matchAll(TOOL_RE)) if (!src.includes(m[0].toLowerCase())) bad.push(m[0]);
  for (const m of text.matchAll(CERT_RE)) if (!src.includes(m[0].toLowerCase())) bad.push(m[0]);
  return bad;
}

const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).filter((x) => x.trim().length > 3).length;

type Row = { persona: string; job: string; company: string; ms: number; tokensIn: number; tokensOut: number; kept: number; removed: number; byRule: Record<string, number>; untraceable: string[]; error?: string };
const rows: Row[] = [];

for (const id of Object.keys(PERSONAS) as PersonaId[]) {
  const p = PERSONAS[id];
  const jobs = early.filter((j) => categoriesForTitle(j.title).some((c) => p.preferences.roles.includes(c))).slice(0, perPersona);
  const factsText = p.facts.map((f) => [f.text, f.org, f.title, f.start, f.end].filter(Boolean).join(" ")).join(" \n ");
  for (const job of jobs) {
    const t0 = Date.now();
    try {
      const fitOut = await structured("fit", "fitAgent", modelChain(settings, "careful"), fitPrompt(job, p.facts), fitSchema, { maxOutputTokens: 1500 });
      const { fit, events: fitEvents } = guardFit(fitOut.data, ledger(p.facts, p.neverClaim));
      const run = await mastra.getWorkflow("kitWorkflow").createRun();
      const out = await run.start({ inputData: { job, profile: p, fit, include: { letter: true, answers: true } }, requestContext: new RequestContext([["chain", modelChain(settings, "careful")]]) });
      if (out.status !== "success") throw new Error(out.status);
      const kit = out.result as Kit;
      if (!kit.cv) throw new Error(kit.errors.join("; ") || "no cv");
      const cvText = [...kit.cv.summary, ...kit.cv.competencies, ...kit.cv.experience.flatMap((r) => r.bullets), ...kit.cv.projects, ...kit.cv.achievements].map((x) => x.text).join(" ");
      const letterText = kit.letter?.paragraphs.map((x) => x.text).join(" ") ?? "";
      const answerText = kit.answers?.answers.map((a) => a.answer).join(" ") ?? "";
      const events: GuardEvent[] = [...fitEvents, ...kit.events];
      const unknown = events.filter((e) => e.ids).flatMap((e) => e.ids!);
      if (unknown.length) console.log("  unknown ids the model cited:", JSON.stringify([...new Set(unknown)].slice(0, 8)));
      const byRule: Record<string, number> = {};
      for (const e of events) byRule[e.rule] = (byRule[e.rule] ?? 0) + 1;
      rows.push({
        persona: p.header.name,
        job: job.title,
        company: job.company,
        ms: Date.now() - t0,
        tokensIn: fitOut.usage.inputTokens + kit.usage.inputTokens,
        tokensOut: fitOut.usage.outputTokens + kit.usage.outputTokens,
        kept: sentences(cvText) + sentences(letterText) + sentences(answerText),
        removed: events.length,
        byRule,
        // Letters may quote the posting's own dates, so the independent check covers the CV.
        untraceable: untraceable(cvText, factsText),
      });
    } catch (e) {
      rows.push({ persona: p.header.name, job: job.title, company: job.company, ms: Date.now() - t0, tokensIn: 0, tokensOut: 0, kept: 0, removed: 0, byRule: {}, untraceable: [], error: e instanceof Error ? e.message : String(e) });
    }
    const r = rows[rows.length - 1];
    console.log(`${r.persona} | ${r.job.slice(0, 50)} | ${(r.ms / 1000).toFixed(0)} s | kept ${r.kept}, removed ${r.removed} ${JSON.stringify(r.byRule)} | untraceable ${r.untraceable.length}${r.error ? ` | ERROR ${r.error}` : ""}`);
  }
}

const ok = rows.filter((r) => !r.error);
const sum = (f: (r: Row) => number) => ok.reduce((s, r) => s + f(r), 0);
const byRule: Record<string, number> = {};
for (const r of ok) for (const [k, v] of Object.entries(r.byRule)) byRule[k] = (byRule[k] ?? 0) + v;
const summary = {
  tier,
  model: modelChain(settings).label,
  kits: ok.length,
  failed: rows.length - ok.length,
  sentencesKept: sum((r) => r.kept),
  removedByGuard: sum((r) => r.removed),
  removedShare: +(sum((r) => r.removed) / Math.max(1, sum((r) => r.kept) + sum((r) => r.removed))).toFixed(3),
  byRule,
  untraceableAfterGuard: sum((r) => r.untraceable.length),
  medianSeconds: ok.length ? +(ok.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(ok.length / 2)] / 1000).toFixed(1) : null,
  avgTokensIn: ok.length ? Math.round(sum((r) => r.tokensIn) / ok.length) : null,
  avgTokensOut: ok.length ? Math.round(sum((r) => r.tokensOut) / ok.length) : null,
};
console.log("\n", summary);
mkdirSync("eval/results", { recursive: true });
writeFileSync(`eval/results/guard-${tier}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ summary, rows }, null, 1));
process.exit(0);
