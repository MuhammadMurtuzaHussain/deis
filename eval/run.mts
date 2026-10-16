// Kit eval: for each demo persona against early-career postings from the snapshot,
// run the real card, fit and kit routes on one model tier, keep everything Gemma
// wrote, and measure:
//   - what the guard removed, by rule (its attempts to over-claim)
//   - an independent re-check of the finished CV: every number, tool and certificate
//     must appear somewhere in the persona's confirmed facts (expect 0)
//   - writing quality: facts repeated across lines, near-copy lines, 5-word runs copied
//     from the posting, leaked brackets, a finished degree written as current, whether
//     the letter names a gap, and words per section
//   - time and tokens per kit, for the cost table
// npx tsx --env-file=.env.local eval/run.mts [ollama|google|demo] [kits per persona] [ollama model]
//   EVAL_KIT_MODEL=gemma4:12b  the bigger local model writes the kit ("Better writing"); card and fit stay on the first
//   EVAL_LANE=careful          letters may name the fit's gaps, as after the Careful lane's questions
// npx tsx eval/run.mts metrics eval/results/<file>.json   (recompute the quality metrics of a saved run)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { POST as cardRoute } from "../src/app/api/card/route";
import { POST as fitRoute } from "../src/app/api/fit/route";
import { POST as kitRoute } from "../src/app/api/kit/route";
import { encodeSettings, type AiSettings } from "../src/lib/ai/settings";
import type { CardWhy } from "../src/lib/ai/schema";
import { cvSections, jaccard, type CvDocument, type CvLine } from "../src/lib/cv/compose";
import { CERTS, TOOLS, type GuardEvent } from "../src/lib/cv/guard";
import type { Fit } from "../src/lib/cv/schema";
import { PERSONAS, type PersonaId } from "../src/lib/demo/personas";
import { categoriesForTitle } from "../src/lib/jobs/categories";
import type { ScoredJob } from "../src/lib/jobs/types";
import { isFinished } from "../src/lib/profile/dates";
import type { Fact } from "../src/lib/profile/types";
import type { Kit } from "../src/mastra/workflows/kit";

const postings: ScoredJob[] = JSON.parse(readFileSync("eval/data/postings.json", "utf8"));
const early = postings.filter((p) => p.seniority.level === "early" || p.seniority.level === "open");

// The eval's own dictionary: the guard's lists plus tools it once missed (OQ-X1), case-insensitive.
const EXTRA_TOOLS = ["Git", "GitHub", "GitLab", "Swift", "Firebase", "Jest", "Selenium", "VBA", "SAS", "Canva", "WordPress", "Prophet", "Qt", "Sage", "Xero", "Kubernetes"];
const TOOL_RE = new RegExp(`(?<![\\w.+#])(${[...TOOLS, ...EXTRA_TOOLS].join("|")})(?![\\w+#])`, "gi");
const CERT_RE = new RegExp(`(?<![\\w+])(${CERTS.join("|")})(?![\\w+])`, "gi");

/** Independent of the guard: anything checkable in the final text that no confirmed fact contains. The profile may name the role as advertised, so the job title counts as a source. */
function untraceable(text: string, factsText: string): string[] {
  const src = factsText.toLowerCase().replace(/,/g, "");
  const bad: string[] = [];
  for (const m of text.matchAll(/(?<![\w.])\d[\d,]*(?:\.\d+)?/g)) if (!src.includes(m[0].replace(/,/g, ""))) bad.push(m[0]);
  for (const m of text.matchAll(TOOL_RE)) if (!new RegExp(`(?<![\\w.+#])${m[0].replace(/[.+#]/g, "\\$&")}(?![\\w+#])`, "i").test(src)) bad.push(m[0]);
  for (const m of text.matchAll(CERT_RE)) if (!src.includes(m[0].toLowerCase())) bad.push(m[0]);
  return bad;
}

/** Gap wording, the eval's own: a letter may name a tool it says it lacks or wants to learn. */
const ADMITS = /\b(haven['’]t|hasn['’]t|have not|has not|not yet|never|no (direct |professional |hands-on )?experience|less (direct )?experience|limited [\w ]{0,20}experience|new to|unfamiliar|keen to learn|eager to learn|look(ing)? forward to learning|(am|currently|now) learning)\b/i;

/**
 * The same check on letters and answers, sentence by sentence. They may quote the posting's
 * years and durations ("a 2 year programme starting in 2027"), name the employer and its
 * role, and name a tool in a sentence admitting the gap.
 */
function untraceableProse(text: string, factsText: string, job: ScoredJob): string[] {
  const posting = job.description.replace(/,/g, "");
  const bad: string[] = [];
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    for (const x of untraceable(s, `${factsText}\n${job.title}\n${job.company}`)) {
      if (/^\d/.test(x)) {
        const n = x.replace(/,/g, "");
        const dated = /^(19|20)\d{2}$/.test(n) || new RegExp(`(?<![\\d.])${n.replace(".", "\\.")}[\\s-]*(?:month|week|year)s?\\b`, "i").test(s);
        if (dated && posting.includes(n)) continue;
      } else if (ADMITS.test(s)) continue;
      bad.push(x);
    }
  }
  return bad;
}

const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).filter((x) => x.trim().length > 3).length;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const grams = (s: string, n = 5) => {
  const t = s.toLowerCase().match(/[a-z0-9€%]+/g) ?? [];
  return t.slice(0, Math.max(0, t.length - n + 1)).map((_, i) => t.slice(i, i + n).join(" "));
};
/** Share of the text's 5-word runs that also appear in the posting. */
const copied = (text: string, posting: Set<string>) => {
  const g = grams(text);
  return g.length ? g.filter((x) => posting.has(x)).length / g.length : 0;
};
const LEAK = /\[[^\]\n]*\]|needsYou|\([^)]*\bposting\b[^)]*\)/gi;
// A finished degree written as ongoing (both personas have finished theirs).
const CURRENT =
  /\b(final[- ]year ([\w-]+ ){0,3}?(student|undergraduate)|current(ly)? (a )?(student|studying|pursuing|enrolled|completing|undertaking|reading|doing)|(is|am) (currently )?(pursuing|studying|completing|undertaking|reading for)|is preparing me|expected to graduate|due to (graduate|finish|complete)|will graduate|(current|ongoing|present) (msc|bsc|ba|ma|btech|meng|beng|degree|studies|master['’]?s|bachelor['’]?s)|(completing|finishing) in 20\d\d)\b/gi;
const NAMES_GAP = /\b(haven['’]t|have not|not yet|no (direct|professional|hands-on) experience|less (direct )?experience|limited (professional |direct |hands-on )?experience|new to)\b/i;

type Output = { jobId: string; card: CardWhy | null; fit: Fit; fitEvents: GuardEvent[]; kit: Kit & { model?: string } };
type Quality = {
  factsCited3Plus: number;
  dupFactRate: number;
  nearCopyPairs: number;
  postingCopy: { cv: number; letter: number; answers: number };
  bracketLeaks: string[];
  tenseErrors: string[];
  /** Numbers, tools and certificates in the letter and answers that no fact or the posting backs. */
  untraceableProse: string[];
  /** Sentences kept because the guard added a citation: worth reading by hand. */
  repairs: number;
  letterNamesGap: boolean;
  words: Record<string, number>;
  /** Guard removals with the text, to read what was dropped. */
  removed: { rule: string; text: string }[];
};

function cvLines(cv: CvDocument): { section: string; line: CvLine }[] {
  return cvSections(cv).flatMap((s) =>
    s.id === "header" ? [] : [...(s.paragraph ?? []), ...(s.entries ?? []).flatMap((e) => e.lines), ...(s.bullets ?? [])].map((line) => ({ section: s.id, line })),
  );
}

function quality(out: Output, job: ScoredJob, facts: Fact[]): Quality {
  const cv = out.kit.cv!;
  const lines = cvLines(cv);
  const cites = new Map<string, number>();
  for (const { line } of lines) for (const id of new Set(line.facts)) cites.set(id, (cites.get(id) ?? 0) + 1);
  const body = lines.filter((l) => l.section !== "profile").map((l) => (l.line.label ? `${l.line.label}: ${l.line.text}` : l.line.text));
  let nearCopyPairs = 0;
  for (let i = 0; i < body.length; i++) for (let j = i + 1; j < body.length; j++) if (jaccard(body[i], body[j]) > 0.45) nearCopyPairs++;
  const posting = new Set(grams(job.description));
  const cvText = lines.map((l) => l.line.text).join(" ");
  const letter = out.kit.letter?.paragraphs.map((p) => p.text).join("\n") ?? "";
  const answers = out.kit.answers?.answers ?? [];
  const answerText = answers.map((a) => a.answer).join(" ");
  const everything = [cvText, ...cvSections(cv).map((s) => (s.id === "header" ? "" : (s.lists ?? []).flatMap((l) => l.items).join(" "))), letter, ...answers.flatMap((a) => [a.question, a.answer])].join("\n");
  const finished = facts.filter((f) => f.kind === "education").every((f) => isFinished(f));
  const sectionWords: Record<string, number> = {};
  for (const s of cvSections(cv)) {
    if (s.id === "header") continue;
    const text = [...(s.paragraph ?? []), ...(s.entries ?? []).flatMap((e) => [{ text: e.heading }, ...e.lines]), ...(s.bullets ?? [])].map((l) => l.text).join(" ") + (s.lists ?? []).map((l) => l.items.join(" ")).join(" ");
    sectionWords[s.id] = words(text);
  }
  const answered = answers.filter((a) => a.answer);
  const factsText = facts.map((f) => [f.text, f.org, f.title, f.start, f.end].filter(Boolean).join(" ")).join(" \n ");
  return {
    factsCited3Plus: [...cites.values()].filter((n) => n >= 3).length,
    dupFactRate: +([...cites.values()].filter((n) => n >= 2).length / Math.max(1, cites.size)).toFixed(3),
    nearCopyPairs,
    postingCopy: { cv: +copied(cvText, posting).toFixed(3), letter: +copied(letter, posting).toFixed(3), answers: +copied(answerText, posting).toFixed(3) },
    bracketLeaks: everything.match(LEAK) ?? [],
    tenseErrors: finished ? (`${cvText}\n${letter}\n${answerText}`.match(CURRENT) ?? []) : [],
    untraceableProse: untraceableProse(`${letter}\n${answers.map((a) => a.answer).join("\n")}`, factsText, job),
    repairs: (out.kit as { repairs?: unknown[] }).repairs?.length ?? 0,
    letterNamesGap: NAMES_GAP.test(letter),
    words: { ...sectionWords, cv: words(cvText), letter: words(letter), answerAvg: answered.length ? Math.round(answered.reduce((n, a) => n + words(a.answer), 0) / answered.length) : 0 },
    removed: [...out.fitEvents, ...out.kit.events].map((e) => ({ rule: e.rule, text: e.text })),
  };
}

type Row = { persona: string; job: string; company: string; ms: number; tokensIn: number; tokensOut: number; kept: number; removed: number; byRule: Record<string, number>; untraceable: string[]; error?: string; output?: Output; quality?: Quality };

const mean = (xs: number[]) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3) : null);

function summarise(rows: Row[], label: Record<string, unknown>) {
  const ok = rows.filter((r) => !r.error);
  const sum = (f: (r: Row) => number) => ok.reduce((s, r) => s + f(r), 0);
  const byRule: Record<string, number> = {};
  for (const r of ok) for (const [k, v] of Object.entries(r.byRule)) byRule[k] = (byRule[k] ?? 0) + v;
  const q = ok.map((r) => r.quality).filter((x): x is Quality => Boolean(x));
  const sectionWords: Record<string, number | null> = {};
  for (const k of new Set(q.flatMap((x) => Object.keys(x.words)))) sectionWords[k] = mean(q.filter((x) => k in x.words).map((x) => x.words[k]));
  return {
    ...label,
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
    quality: {
      factsCited3PlusPerKit: mean(q.map((x) => x.factsCited3Plus)),
      dupFactRate: mean(q.map((x) => x.dupFactRate)),
      nearCopyPairsPerKit: mean(q.map((x) => x.nearCopyPairs)),
      postingCopy: { cv: mean(q.map((x) => x.postingCopy.cv)), letter: mean(q.map((x) => x.postingCopy.letter)), answers: mean(q.map((x) => x.postingCopy.answers)) },
      bracketLeaks: q.reduce((n, x) => n + x.bracketLeaks.length, 0),
      tenseErrors: q.reduce((n, x) => n + x.tenseErrors.length, 0),
      untraceableInLettersAndAnswers: q.reduce((n, x) => n + (x.untraceableProse?.length ?? 0), 0),
      citationsRepaired: q.reduce((n, x) => n + (x.repairs ?? 0), 0),
      lettersNamingAGap: `${q.filter((x) => x.letterNamesGap).length} of ${q.length}`,
      wordsPerSection: sectionWords,
    },
  };
}

const personaOf = (name: string) => Object.values(PERSONAS).find((p) => p.header.name === name)!;

// ---- Recompute the metrics of a saved run (the baseline was saved before the metrics existed)
if (process.argv[2] === "metrics") {
  const file = process.argv[3];
  const saved = JSON.parse(readFileSync(file, "utf8")) as { summary: Record<string, unknown>; rows: Row[] };
  for (const r of saved.rows) {
    if (r.error || !r.output) continue;
    const job = postings.find((p) => p.id === r.output!.jobId)!;
    r.quality = quality(r.output, job, personaOf(r.persona).facts);
  }
  const summary = summarise(saved.rows, { tier: saved.summary.tier, model: saved.summary.model });
  console.log(JSON.stringify(summary, null, 1));
  writeFileSync(file, JSON.stringify({ summary, rows: saved.rows }, null, 1));
  process.exit(0);
}

const tier = process.argv[2] ?? "ollama";
const perPersona = Number(process.argv[3] ?? 3);
const ollamaModel = process.argv[4] ?? "gemma4:e4b";
const settings: AiSettings =
  tier === "google"
    ? { provider: "google", apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!, model: "gemma-4-26b-a4b-it" }
    : tier === "demo"
      ? { provider: "demo" }
      : { provider: "ollama", baseUrl: "http://127.0.0.1:11434/api", model: ollamaModel, ...(process.env.EVAL_KIT_MODEL ? { kitModel: process.env.EVAL_KIT_MODEL } : {}) };
const lane = process.env.EVAL_LANE === "careful" ? "careful" : "quick";

/** The real route, as the app calls it: body checks, rate limits, guard and all. */
async function call<T>(route: (req: Request) => Promise<Response>, path: string, payload: unknown): Promise<T> {
  const res = await route(new Request(`http://localhost:3200${path}`, { method: "POST", headers: { "content-type": "application/json", "x-deis-ai": encodeSettings(settings) }, body: JSON.stringify(payload) }));
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status} ${data.error ?? ""} ${data.message ?? ""}`);
  return data as T;
}

const rows: Row[] = [];
let label = "";
for (const id of Object.keys(PERSONAS) as PersonaId[]) {
  const p = PERSONAS[id];
  const jobs = early.filter((j) => categoriesForTitle(j.title).some((c) => p.preferences.roles.includes(c))).slice(0, perPersona);
  const factsText = p.facts.map((f) => [f.text, f.org, f.title, f.start, f.end].filter(Boolean).join(" ")).join(" \n ");
  for (const job of jobs) {
    const t0 = Date.now();
    try {
      const card = await call<CardWhy & { usage?: unknown }>(cardRoute, "/api/card", { job, facts: p.facts, neverClaim: p.neverClaim }).catch(() => null);
      const fitOut = await call<{ fit: Fit; events: GuardEvent[]; usage: { inputTokens: number; outputTokens: number } }>(fitRoute, "/api/fit", { job, facts: p.facts, neverClaim: p.neverClaim });
      const kit = await call<Kit & { model: string }>(kitRoute, "/api/kit", { job, profile: p, fit: fitOut.fit, include: { letter: true, answers: true }, lane });
      label = kit.model;
      const output: Output = { jobId: job.id, card, fit: fitOut.fit, fitEvents: fitOut.events, kit };
      const q = quality(output, job, p.facts);
      const cvText = cvLines(kit.cv!).map((l) => l.line.text).join(" ");
      const letterText = kit.letter?.paragraphs.map((x) => x.text).join(" ") ?? "";
      const answerText = kit.answers?.answers.map((a) => a.answer).join(" ") ?? "";
      const events = [...fitOut.events, ...kit.events];
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
        // Letters and answers have their own check in quality (they may quote the posting's dates).
        untraceable: untraceable(cvText, `${factsText}\n${job.title}`),
        output,
        quality: q,
      });
    } catch (e) {
      rows.push({ persona: p.header.name, job: job.title, company: job.company, ms: Date.now() - t0, tokensIn: 0, tokensOut: 0, kept: 0, removed: 0, byRule: {}, untraceable: [], error: e instanceof Error ? e.message : String(e) });
    }
    const r = rows[rows.length - 1];
    const q = r.quality;
    console.log(
      `${r.persona} | ${r.job.slice(0, 50)} | ${(r.ms / 1000).toFixed(0)} s | kept ${r.kept}, removed ${r.removed} ${JSON.stringify(r.byRule)} | untraceable ${r.untraceable.length}` +
        (q ? ` | dup ${q.dupFactRate} near ${q.nearCopyPairs} leaks ${q.bracketLeaks.length} tense ${q.tenseErrors.length} gap ${q.letterNamesGap}` : "") +
        (r.error ? ` | ERROR ${r.error}` : ""),
    );
  }
}

const summary = summarise(rows, { tier, model: label || ollamaModel, lane });
console.log("\n", JSON.stringify(summary, null, 1));
mkdirSync("eval/results", { recursive: true });
writeFileSync(`eval/results/kit-${tier}-${new Date().toISOString().slice(0, 10)}-${process.env.EVAL_LABEL ?? (label || ollamaModel).replace(/[^\w.-]+/g, "_")}.json`, JSON.stringify({ summary, rows }, null, 1));
process.exit(0);
