import { cvSections, jaccard, type CvDocument, type CvLine } from "./compose";
import { CERTS, TOOLS } from "./guard";
import { isFinished } from "../profile/dates";
import type { Fact } from "../profile/types";

// Checks on a finished kit, independent of the guard: the offline eval (eval/run.mts)
// and the live Mastra scorers (src/mastra/scorers.ts) both use them. They only read.

// The checks' own dictionary: the guard's lists plus tools it once missed (OQ-X1), case-insensitive.
const EXTRA_TOOLS = ["Git", "GitHub", "GitLab", "Swift", "Firebase", "Jest", "Selenium", "VBA", "SAS", "Canva", "WordPress", "Prophet", "Qt", "Sage", "Xero", "Kubernetes"];
const TOOL_RE = new RegExp(`(?<![\\w.+#])(${[...TOOLS, ...EXTRA_TOOLS].join("|")})(?![\\w+#])`, "gi");
const CERT_RE = new RegExp(`(?<![\\w+])(${CERTS.join("|")})(?![\\w+])`, "gi");

export type Untraceable = { kind: "number" | "tool" | "certificate"; token: string };

/** Everything a confirmed fact says, as one text to search. */
export const factsText = (facts: Fact[]) => facts.map((f) => [f.text, f.org, f.title, f.start, f.end].filter(Boolean).join(" ")).join(" \n ");

/** Anything checkable in the text that the source doesn't contain: numbers, tools, certificates. */
export function untraceableIn(text: string, source: string): Untraceable[] {
  const src = source.toLowerCase().replace(/,/g, "");
  const bad: Untraceable[] = [];
  for (const m of text.matchAll(/(?<![\w.])\d[\d,]*(?:\.\d+)?/g)) if (!src.includes(m[0].replace(/,/g, ""))) bad.push({ kind: "number", token: m[0] });
  for (const m of text.matchAll(TOOL_RE)) if (!new RegExp(`(?<![\\w.+#])${m[0].replace(/[.+#]/g, "\\$&")}(?![\\w+#])`, "i").test(src)) bad.push({ kind: "tool", token: m[0] });
  for (const m of text.matchAll(CERT_RE)) if (!src.includes(m[0].toLowerCase())) bad.push({ kind: "certificate", token: m[0] });
  return bad;
}

/** Gap wording: a letter may name a tool it says it lacks or wants to learn. */
const ADMITS = /\b(haven['’]t|hasn['’]t|have not|has not|not yet|never|no (direct |professional |hands-on )?experience|less (direct )?experience|limited [\w ]{0,20}experience|new to|unfamiliar|keen to learn|eager to learn|look(ing)? forward to learning|(am|currently|now) learning)\b/i;

type Posting = { title: string; company: string; description: string };

/**
 * The same check on letters and answers, sentence by sentence. They may quote the posting's
 * years and durations ("a 2 year programme starting in 2027"), name the employer and its
 * role, and name a tool in a sentence admitting the gap.
 */
export function untraceableInProse(text: string, facts: string, job: Posting): Untraceable[] {
  const posting = job.description.replace(/,/g, "");
  const bad: Untraceable[] = [];
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    for (const x of untraceableIn(s, `${facts}\n${job.title}\n${job.company}`)) {
      if (x.kind === "number") {
        const n = x.token.replace(/,/g, "");
        const dated = /^(19|20)\d{2}$/.test(n) || new RegExp(`(?<![\\d.])${n.replace(".", "\\.")}[\\s-]*(?:month|week|year)s?\\b`, "i").test(s);
        if (dated && posting.includes(n)) continue;
      } else if (ADMITS.test(s)) continue;
      bad.push(x);
    }
  }
  return bad;
}

/** Every written line of the CV except the header, with its section. */
export function cvLines(cv: CvDocument): { section: string; line: CvLine }[] {
  return cvSections(cv).flatMap((s) =>
    s.id === "header" ? [] : [...(s.paragraph ?? []), ...(s.entries ?? []).flatMap((e) => e.lines), ...(s.bullets ?? [])].map((line) => ({ section: s.id, line })),
  );
}

export const cvText = (cv: CvDocument) => cvLines(cv).map((l) => l.line.text).join(" ");

/** Pairs of CV body lines (not the profile) that say nearly the same thing. */
export function nearCopyPairs(cv: CvDocument): { pairs: number; lines: number } {
  const body = cvLines(cv)
    .filter((l) => l.section !== "profile")
    .map((l) => (l.line.label ? `${l.line.label}: ${l.line.text}` : l.line.text));
  let pairs = 0;
  for (let i = 0; i < body.length; i++) for (let j = i + 1; j < body.length; j++) if (jaccard(body[i], body[j]) > 0.45) pairs++;
  return { pairs, lines: body.length };
}

/** Prompt text that leaked into the output: fact-id brackets, field names, notes about "the posting". */
export const LEAK = /\[[^\]\n]*\]|needsYou|\([^)]*\bposting\b[^)]*\)/gi;

/** A finished degree written as ongoing. */
export const CURRENT =
  /\b(final[- ]year ([\w-]+ ){0,3}?(student|undergraduate)|current(ly)? (a )?(student|studying|pursuing|enrolled|completing|undertaking|reading|doing)|(is|am) (currently )?(pursuing|studying|completing|undertaking|reading for)|is preparing me|expected to graduate|due to (graduate|finish|complete)|will graduate|(current|ongoing|present) (msc|bsc|ba|ma|btech|meng|beng|degree|studies|master['’]?s|bachelor['’]?s)|(completing|finishing) in 20\d\d)\b/gi;

/** True when there is education and all of it has finished, so "currently studying" is wrong. */
export const degreesFinished = (facts: Fact[], now?: Date) => {
  const ed = facts.filter((f) => f.kind === "education");
  return ed.length > 0 && ed.every((f) => isFinished(f, now));
};

export const sentenceCount = (s: string) => s.split(/(?<=[.!?])\s+/).filter((x) => x.trim().length > 3).length;
