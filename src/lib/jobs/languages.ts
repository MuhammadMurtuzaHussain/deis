// Dublin is an EMEA hub: a big share of entry-level sales, support and success roles
// need a second language ("Account Executive, DACH", "Turkish Speaker"). Code reads
// the language from the title or a fluency line, and the deck hides roles that need
// a language the user didn't list. English is assumed.

export const LANGUAGES = [
  "Arabic",
  "Chinese",
  "Czech",
  "Danish",
  "Dutch",
  "Finnish",
  "French",
  "German",
  "Greek",
  "Hebrew",
  "Hindi",
  "Hungarian",
  "Irish",
  "Italian",
  "Japanese",
  "Korean",
  "Norwegian",
  "Polish",
  "Portuguese",
  "Romanian",
  "Russian",
  "Spanish",
  "Swedish",
  "Turkish",
  "Ukrainian",
] as const;
export type Language = (typeof LANGUAGES)[number];

const ALIASES: Record<string, Language> = { mandarin: "Chinese", cantonese: "Chinese", gaeilge: "Irish" };

/** Markets that, in a Dublin title, mean "you'll work in this language". */
const MARKETS: [RegExp, Language[]][] = [
  [/\bdach\b|\bgermany\b|\baustria\b/i, ["German"]],
  [/\bnordics?\b/i, ["Swedish", "Danish", "Norwegian", "Finnish"]],
  [/\bbenelux\b|\bnetherlands\b/i, ["Dutch"]],
  [/\bfrance\b|\bfrench market\b/i, ["French"]],
  [/\bspain\b|\biberia\b|\bspanish market\b|\blatam\b/i, ["Spanish"]],
  [/\bitaly\b|\bitalian market\b/i, ["Italian"]],
  [/\bportugal\b|\bbrazil\b/i, ["Portuguese"]],
  [/\bpoland\b/i, ["Polish"]],
  [/\bjapan\b/i, ["Japanese"]],
  [/\bkorea\b/i, ["Korean"]],
];

const NAMES = [...LANGUAGES, ...Object.keys(ALIASES)].join("|");
const TITLE_LANGUAGE = new RegExp(`\\b(${NAMES})\\b`, "gi");
const FLUENCY = new RegExp(
  `\\b(?:fluen(?:t|cy)|native|proficien(?:t|cy)|business[- ]level|professional[- ]level|written and spoken|verbal and written)\\b[^.\\n]{0,40}\\b(${NAMES})\\b|\\b(${NAMES})\\b[^.\\n]{0,15}\\b(?:speaking|speaker|fluency|fluent|native|language skills|is (?:essential|required|a must))\\b`,
  "gi",
);
const OPTIONAL = /\b(nice to have|a plus|bonus|advantage|advantageous|desirable|preferred|beneficial|ideally)\b/i;

const canonical = (s: string): Language => ALIASES[s.toLowerCase()] ?? ((s[0].toUpperCase() + s.slice(1).toLowerCase()) as Language);

/** Languages other than English the role needs. Any one of a market's languages is enough. */
export function requiredLanguages(title: string, description: string): Language[][] {
  const needs: Language[][] = [];
  for (const m of title.matchAll(TITLE_LANGUAGE)) {
    // "Irish market" is a territory, not a language.
    if (/^\s*market/i.test(title.slice((m.index ?? 0) + m[0].length))) continue;
    needs.push([canonical(m[1])]);
  }
  if (!needs.length) for (const [re, langs] of MARKETS) if (re.test(title)) needs.push(langs);
  for (const m of description.matchAll(FLUENCY)) {
    const line = description.slice(Math.max(0, (m.index ?? 0) - 60), (m.index ?? 0) + m[0].length + 60);
    if (OPTIONAL.test(line)) continue;
    const lang = canonical(m[1] ?? m[2]);
    // "fluent English" is the baseline, and Irish only counts when the title asks for it.
    if (lang === ("English" as Language) || lang === "Irish") continue;
    needs.push([lang]);
  }
  const seen = new Set<string>();
  return needs.filter((n) => {
    const k = n.join("/");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function speaksEnough(needs: Language[][], spoken: Language[]): boolean {
  return needs.every((anyOf) => anyOf.some((l) => spoken.includes(l)));
}
