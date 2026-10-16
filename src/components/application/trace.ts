import type { CvLine, CvSection } from "@/lib/cv/compose";
import type { GuardEvent, GuardRule } from "@/lib/cv/guard";
import type { Kit } from "@/lib/client/db";
import type { FactKind } from "@/lib/profile/types";

// Pure helpers for the kit workspace: numbering the facts a CV cites, grouping the
// guard's checks, and merging a rewritten kit with the old one. Tested in tests/trace.test.ts.

/** Every line that can carry trace markers, in page order. Code-owned headings (employer, degree, dates) aren't lines here. */
export function tracedLines(sections: CvSection[]): CvLine[] {
  const out: CvLine[] = [];
  for (const s of sections) {
    if (s.id === "header") continue;
    out.push(...(s.paragraph ?? []));
    for (const e of s.entries ?? []) out.push(...e.lines);
    out.push(...(s.bullets ?? []));
  }
  return out;
}

/**
 * Facts numbered 1, 2, 3 by first use. known: drop ids that no longer exist (a deleted fact),
 * so a marker never points at nothing.
 */
export function numberFacts(lines: { facts: string[] }[], known: (id: string) => boolean = () => true): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const l of lines) for (const id of l.facts) if (!numbers.has(id) && known(id)) numbers.set(id, numbers.size + 1);
  return numbers;
}

/** How many lines cite each fact. */
export function usage(lines: { facts: string[] }[]): Map<string, number> {
  const n = new Map<string, number>();
  for (const l of lines) for (const id of new Set(l.facts)) n.set(id, (n.get(id) ?? 0) + 1);
  return n;
}

/** The ids on a line that have a number, in number order, without repeats. */
export function lineMarkers(facts: string[], numbers: Map<string, number>): string[] {
  return [...new Set(facts)].filter((id) => numbers.has(id)).sort((a, b) => numbers.get(a)! - numbers.get(b)!);
}

/** Checks grouped by rule: the most common first, then in the order they happened. */
export function groupEvents(events: GuardEvent[]): { rule: GuardRule; items: GuardEvent[] }[] {
  const groups = new Map<GuardRule, GuardEvent[]>();
  for (const e of events) groups.set(e.rule, [...(groups.get(e.rule) ?? []), e]);
  const order = [...groups.keys()];
  return order.map((rule) => ({ rule, items: groups.get(rule)! })).sort((a, b) => b.items.length - a.items.length || order.indexOf(a.rule) - order.indexOf(b.rule));
}

export type KitPart = "cv" | "letter" | "answers";

/** Parts the server couldn't write, from its "letter: timed out" lines. */
export function failedParts(errors: string[] | undefined): KitPart[] {
  const parts = (errors ?? []).map((e) => e.split(":")[0].trim()).filter((p): p is KitPart => p === "cv" || p === "letter" || p === "answers");
  return [...new Set(parts)];
}

/**
 * A rewritten kit replaces the old one, except that a part the rewrite failed on keeps the
 * old version when there was one. Nothing that worked before is lost to a bad second try.
 */
export function mergeRewrite(old: Kit, next: Kit): Kit {
  const failed = failedParts(next.errors);
  const keepLetter = failed.includes("letter") && !next.letter && old.letter;
  const keepAnswers = failed.includes("answers") && !next.answers && old.answers;
  if (!keepLetter && !keepAnswers) return next;
  const kept = new Set<KitPart>([...(keepLetter ? ["letter" as const] : []), ...(keepAnswers ? ["answers" as const] : [])]);
  const errors = (next.errors ?? []).filter((e) => !kept.has(e.split(":")[0].trim() as KitPart));
  return { ...next, letter: keepLetter ? old.letter : next.letter, answers: keepAnswers ? old.answers : next.answers, errors };
}

/**
 * runKit puts the application's fit events in front of the kit's own. When the fit is checked
 * again in the same rewrite, swap the old fit events for the new ones.
 */
export function withFitEvents(kit: Kit, oldFitEvents: GuardEvent[], newFitEvents: GuardEvent[]): Kit {
  return { ...kit, events: [...newFitEvents, ...kit.events.slice(oldFitEvents.length)] };
}

export const KIND_LABEL: Record<FactKind, string> = {
  role: "Job",
  achievement: "Achievement",
  skill: "Skill",
  education: "Education",
  project: "Project",
  certification: "Certificate",
  language: "Language",
  leadership: "Leadership",
  other: "Other",
};
