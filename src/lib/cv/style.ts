// House style for everything Deis writes, enforced in code: plain words, Irish and
// British spelling, no em dashes. Gemma is asked nicely in the prompt; this makes sure.

const BUZZ = String.raw`(?:highly\s+)?(?:passionate|results[- ]driven|dynamic|motivated|hard[- ]working|detail[- ]oriented)`;
/** Words for the person a CV describes: "motivated graduate", "detail-oriented data analyst". */
const SELF_NOUN = String.raw`(?:graduate|student|professional|individual|person|candidate|team player|team member|learner|self[- ]starter|communicator|problem[- ]solver|leader|worker|engineer|developer|analyst|scientist|specialist|consultant|accountant|designer|programmer|researcher|marketer|manager|coordinator|administrator|technician|assistant|intern|trainee|apprentice|officer|associate|executive|contributor|collaborator|thinker|achiever)`;

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
  [/\b(?:highly |deeply |very )?passionate about\b/gi, "interested in"],
  // Only when they describe the person: "a motivated graduate", never "dynamic programming"
  // or "Motivated 4 new staff" (a verb, followed by who was motivated).
  [new RegExp(String.raw`\b${BUZZ}(?:\s*(?:,|and)\s+${BUZZ})*\s+(?!(?:a|an|the|my|our|his|her|their|its|this|that|these|those|\d)\b)(?=(?:(?!(?:and|or)\b)[\w-]+\s+){0,3}${SELF_NOUN}s?\b)`, "gi"), ""],
  [/\b(world[- ]class|cutting-edge|best-in-class|state-of-the-art)\s+/gi, ""],
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
    .replace(/^([a-z][\w.+#-]*)/, (w) => (keepsLowercase(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .trim();
}

/** Tools written in lower case on purpose: a skill line starting "pandas" stays "pandas". */
const LOWERCASE_TOOLS = new Set(
  "pandas numpy scipy scikit-learn sklearn matplotlib seaborn plotly dplyr ggplot2 tidyverse nltk spacy pytest jest npm pnpm yarn pip conda webpack vite dbt git kubectl bash zsh vim curl ffmpeg xgboost lightgbm openpyxl regex".split(" "),
);
const keepsLowercase = (w: string) => LOWERCASE_TOOLS.has(w.toLowerCase()) || /[A-Z]|\d|[.+#]\w/.test(w.slice(1));

/** Courses and grades use the Roman numeral I: "Calculus I", "Grade I", "Accounting I and II". */
const ROMAN_BEFORE = String.raw`(?<!\b(?:Grade|Level|Part|Stage|Phase|Year|Paper|Unit|Module|Class|Type|Tier|Book|Volume|Chapter|Section|Series|Semester|Term)\s)`;
const ROMAN_AFTER = String.raw`(?![ \t]*(?:[,.;:()/&–-]|$)|\s+(?:and|or|&|to|II|III)\b)`;
/** CV lines are written without "I" or "my". A lone capital I after a course name and before punctuation is a numeral. */
export const FIRST_PERSON = new RegExp(String.raw`${ROMAN_BEFORE}\bI['’](?:m|ve|d|ll)\b|${ROMAN_BEFORE}(?:(?<![A-Z][\w-]*\s)\bI\b|\bI\b${ROMAN_AFTER})|\b(?:[Mm]y|[Mm]e|[Mm]yself)\b`);
