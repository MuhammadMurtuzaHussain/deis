// House style for everything Deis writes, enforced in code: plain words, Irish and
// British spelling, no em dashes. Gemma is asked nicely in the prompt; this makes sure.

/** Words recruiters skim past. Replaced where there's a plain equivalent, removed where there isn't. */
const PLAIN: [RegExp, string][] = [
  [/\bspearheading\b/gi, "leading"],
  [/\bspearhead(ed)?\b/gi, "led"],
  [/\b(?:leverag|utili[sz])ing\b/gi, "using"],
  [/\b(?:leverag|utili[sz])ed\b/gi, "used"],
  [/\b(?:leverag|utili[sz])es\b/gi, "uses"],
  [/\b(?:leverag|utili[sz])e\b/gi, "use"],
  [/\bsynerg(y|ies)\b/gi, "collaboration"],
  [/\b(proven track record of|proven track record in)\s+/gi, ""],
  [/\b(highly )?(passionate|results[- ]driven|dynamic|motivated|hard[- ]working|detail[- ]oriented|go[- ]getter|self[- ]starter)\s+/gi, ""],
  [/\b(world[- ]class|cutting[- ]edge|best[- ]in[- ]class|state[- ]of[- ]the[- ]art)\s+/gi, ""],
  [/\bI am (excited|thrilled|delighted) to\b/gi, "I would like to"],
  [/\bI am writing to (apply|express my interest)[^.]*\.\s*/gi, ""],
];

const US_TO_UK: [RegExp, string][] = [
  [/\b(organi|reali|recogni|speciali|prioriti|optimi|summari|standardi|categori|minimi|maximi|utili|digiti|moderni|authori|emphasi|capitali|finali|mobili|visuali|customi|operationali|synthesi|characteri)z(e|ed|es|ing|ation|ations)\b/gi, "$1s$2"],
  [/\banaly(z)(e|ed|es|ing)\b/gi, "analys$2"],
  [/\b(colo|behavio|favo|labo|hono|rumo|endeavo)r(s|ed|ing)?\b/gi, "$1ur$2"],
  [/\bcenter(s|ed)?\b/gi, "centre$1"],
  [/\benrollment\b/gi, "enrolment"],
  [/\bcatalog(s)?\b/gi, "catalogue$1"],
  [/\bdefense\b/gi, "defence"],
  [/\blicense(d)?\b(?= (to|for|holder|number))/gi, "licence"],
];

function keepCase(original: string, replacement: string): string {
  if (!replacement) return replacement;
  return original[0] === original[0].toUpperCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
}

export function houseStyle(input: string): string {
  // Markdown has no place in a CV line: "**Data analysis**" → "Data analysis".
  const s = input.replace(/\*\*|__/g, "").replace(/^\s*[*•-]\s+/, "");
  let out = s.replace(/\s*[—–]\s*(?=\S)/g, (m, offset: number) => {
    // An en dash between numbers is a range ("2024–2025"); keep it.
    const before = s[offset - 1];
    return /\d/.test(before ?? "") && m.trim() === "–" ? "–" : ", ";
  });
  // Removed words leave a marker so "a world-class initiative" becomes "an initiative", not "a initiative".
  for (const [re, to] of PLAIN) out = out.replace(re, (m) => keepCase(m, to.replace(/\$\d/g, "")) || "\u0000");
  out = out
    .replace(/\b([Aa]) \u0000(?=[aeiouAEIOU])/g, "$1n ")
    .replace(/\b([Aa])n \u0000(?=[^aeiouAEIOU\s])/g, "$1 ")
    .replace(/\u0000/g, "");
  for (const [re, to] of US_TO_UK) out = out.replace(re, (...args) => {
    const m = args[0] as string;
    const groups = args.slice(1, -2) as (string | undefined)[];
    const rep = to.replace(/\$(\d)/g, (_x, i: string) => groups[Number(i) - 1] ?? "");
    return m[0] === m[0].toUpperCase() ? rep[0].toUpperCase() + rep.slice(1) : rep;
  });
  return out
    .replace(/!+/g, ".")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/^([a-z])/, (c) => c.toUpperCase())
    .trim();
}

/** CV lines are written without "I" or "my". */
export const FIRST_PERSON = /\b(I|I'm|I've|I'd|my|me|myself)\b/;
