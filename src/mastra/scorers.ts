import { createScorer, notScorable, type MastraScorer } from "@mastra/core/evals";
import { cvSections } from "@/lib/cv/compose";
import { CURRENT, cvLines, cvText, degreesFinished, factsText, LEAK, nearCopyPairs, sentenceCount, untraceableIn, untraceableInProse, type Untraceable } from "@/lib/cv/quality";
import type { Fact } from "@/lib/profile/types";
import type { Kit } from "./workflows/kit";

// Quality monitoring on every kit, with no model: the offline eval's checks (eval/run.mts)
// as Mastra scorers. Each gives a 0–1 score and a reason made only of rule names and
// counts, never CV, posting or prompt text, so a score can leave the server the way a
// stripped span does (src/mastra/observability.ts). They read the finished kit and
// never change it: Gemma judges, code guarantees, scorers watch.

export type KitScoreInput = { job: { title: string; company: string; description: string }; facts: Fact[] };
type Verdict = { score: number; reason: string };

/** One clean kit scores 1; each problem found lowers it: 1/(1 + n). */
const clean = (n: number) => +(1 / (1 + n)).toFixed(3);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const byKey = <T>(xs: T[], key: (x: T) => string) => {
  const counts = new Map<string, number>();
  for (const x of xs) counts.set(key(x), (counts.get(key(x)) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => `${k} ${n}`).join(", ");
};

/** A scorer whose every step is code: preprocess decides, the other steps read its verdict. */
function check(id: string, description: string, judge: (input: KitScoreInput, kit: Kit) => Verdict | ReturnType<typeof notScorable>) {
  return createScorer<KitScoreInput, Kit>({ id, description })
    .preprocess(({ run }) => judge(run.input as KitScoreInput, run.output))
    .generateScore(({ results }) => (results.preprocessStepResult as Verdict).score)
    .generateReason(({ results }) => (results.preprocessStepResult as Verdict).reason);
}

const confirmed = (i: KitScoreInput) => factsText(i.facts.filter((f) => f.confirmed));
const untraceableVerdict = (bad: Untraceable[], where: string): Verdict => ({
  score: clean(bad.length),
  reason: bad.length ? `${plural(bad.length, "untraceable item")} in the ${where}: ${byKey(bad, (x) => x.kind)}` : `0 untraceable items in the ${where}`,
});
const letterText = (kit: Kit) => kit.letter?.paragraphs.map((p) => p.text).join("\n") ?? "";
const empty = (kit: Kit) => !kit.cv && !kit.letter && !kit.answers;
const answersText = (kit: Kit) => (kit.answers?.answers ?? []).map((a) => a.answer).join("\n");

export const untraceableCv = check(
  "kit-untraceable-cv",
  "Numbers, tools and certificates left in the CV after the guard that no confirmed fact (or the job title) contains. 1 when none.",
  (input, kit) => (kit.cv ? untraceableVerdict(untraceableIn(cvText(kit.cv), `${confirmed(input)}\n${input.job.title}`), "CV") : notScorable("no CV")),
);

export const untraceableLetter = check(
  "kit-untraceable-letter",
  "The same check on the letter, which may quote the posting's dates and name a tool in a sentence admitting the gap. 1 when none.",
  (input, kit) => (kit.letter ? untraceableVerdict(untraceableInProse(letterText(kit), confirmed(input), input.job), "letter") : notScorable("no letter")),
);

export const untraceableAnswers = check(
  "kit-untraceable-answers",
  "The same check on the drafted form answers. 1 when none.",
  (input, kit) => (kit.answers ? untraceableVerdict(untraceableInProse(answersText(kit), confirmed(input), input.job), "answers") : notScorable("no answers")),
);

export const nearCopies = check("kit-near-copies", "CV lines (outside the profile) that say nearly the same thing as another line. 1 when none.", (_, kit) => {
  if (!kit.cv) return notScorable("no CV");
  const { pairs, lines } = nearCopyPairs(kit.cv);
  return { score: clean(pairs), reason: `${plural(pairs, "near-copy pair")} among ${plural(lines, "line")}` };
});

export const finishedDegreeAsCurrent = check("kit-finished-degree-as-current", "A finished degree written as ongoing (\"currently studying\") anywhere in the kit. 1 when none.", (input, kit) => {
  if (empty(kit)) return notScorable("nothing written");
  if (!degreesFinished(input.facts.filter((f) => f.confirmed))) return notScorable("no finished degree, or one still ongoing");
  const n = [kit.cv ? cvText(kit.cv) : "", letterText(kit), answersText(kit)].join("\n").match(CURRENT)?.length ?? 0;
  return { score: clean(n), reason: `${plural(n, "phrase")} writing a finished degree as current` };
});

const leakKind = (m: string) => (m.startsWith("[") ? "brackets" : m.startsWith("(") ? "posting note" : "field name");
export const promptLeaks = check("kit-prompt-leaks", "Prompt text in the kit: fact-id brackets, schema field names, notes about the posting. 1 when none.", (_, kit) => {
  if (empty(kit)) return notScorable("nothing written");
  const lists = kit.cv ? cvSections(kit.cv).flatMap((s) => (s.id === "header" ? [] : (s.lists ?? []).flatMap((l) => l.items))) : [];
  const text = [kit.cv ? cvText(kit.cv) : "", ...lists, letterText(kit), ...(kit.answers?.answers ?? []).flatMap((a) => [a.question, a.answer])].join("\n");
  const leaks = text.match(LEAK) ?? [];
  return { score: clean(leaks.length), reason: leaks.length ? `${plural(leaks.length, "leak")}: ${byKey(leaks, leakKind)}` : "0 leaks" };
});

export const guardRemoved = check(
  "kit-guard-removed",
  "Share of the kit's sentences the guard removed because no confirmed fact backed them (lower is better), by rule.",
  (_, kit) => {
    const kept = sentenceCount([kit.cv ? cvLines(kit.cv).map((l) => l.line.text).join(" ") : "", letterText(kit), answersText(kit)].join(" "));
    const removed = kit.events.length;
    const total = kept + removed;
    if (!total) return notScorable("nothing written");
    return { score: +(removed / total).toFixed(3), reason: removed ? `removed ${removed} of ${total} sentences: ${byKey(kit.events, (e) => e.rule)}` : `removed 0 of ${total} sentences` };
  },
);

export const kitScorers: MastraScorer<string, KitScoreInput, Kit, Record<string, unknown>>[] = [untraceableCv, untraceableLetter, untraceableAnswers, nearCopies, finishedDegreeAsCurrent, promptLeaks, guardRemoved] as never;

export type KitScore = { scorerId: string; scorerName: string; score: number; reason: string };

/** Runs every kit scorer. Pure code, a few milliseconds. A scorer that has nothing to look at is left out. */
export async function scoreKit(input: KitScoreInput, kit: Kit): Promise<KitScore[]> {
  const out: KitScore[] = [];
  for (const s of kitScorers) {
    const r = await s.run({ input, output: kit });
    if (r.notScorable || typeof r.score !== "number") continue;
    out.push({ scorerId: s.id, scorerName: s.name, score: r.score, reason: String(r.reason ?? "") });
  }
  return out;
}
