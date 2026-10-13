import type { Level, Seniority } from "./types";

// Code decides whether a job is early-career; Gemma never does. Every verdict carries
// the words from the posting that decided it, so the card can say *why* ("asks for
// 3+ years") and the user can disagree.
//
//   early   : the title or text says graduate, junior, intern, entry level …
//   open    : no signal either way (most postings)
//   stretch : asks for 2 years, a level II title, or a soft "manager"
//   senior  : asks for 3+ years, or a senior / lead / principal / head title. Hidden by default.

const EARLY_TITLE =
  /\b(graduate|grad|new grad|junior|jnr|jr\.?|entry[- ]level|intern(ship)?|trainee|apprentice(ship)?|placement|early[- ]careers?|associate(?! (director|principal|vice|general counsel|partner))|level 1|analyst i)\b/i;
const SENIOR_TITLE =
  /\b(senior|snr|sr\.?|lead(?! generation)|principal|staff(?! accountant)|head|director|vp|vice president|chief|architect|distinguished|fellow)\b|\b(engineering|team|people|general|regional|country|delivery|operations|senior) manager\b/i;
const LEVEL_THREE_PLUS = /\b(iii|iv|l[4-9]|level [3-9])\b/i;
const LEVEL_TWO = /\b(ii|l3|level 2)\b/i;
const SOFT_MANAGER = /\bmanager\b/i;

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const NUM = String.raw`(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)`;

// "3+ years", "minimum of 3 years", "at least two years", "2-4 years", "3 or more years",
// "5 years' experience". The experience word must sit nearby so "a 2-year programme" or
// "within 3 years" don't count.
const YEARS = new RegExp(
  String.raw`(?:minimum(?: of)?|at least|over|more than)?\s*\b${NUM}\s*(?:\+|plus|or more)?\s*(?:(?:-|–|to)\s*${NUM}\s*)?\+?\s*(?:years?|yrs?)(?:['’]s?)?\b`,
  "gi",
);
const EXPERIENCE_NEAR = /experience|exp\b|background|track record|working in|in (a|an) (similar|related)|professional/i;
const NOT_EXPERIENCE = /\b(programme|program|contract|course|degree|old|of age|warranty|anniversary|history|since|founded|ago|within|over the (next|past|last)|years? (in business|running|of growth))\b/i;
const SOFT = /\b(preferred|desirable|ideally|nice to have|bonus|advantage|advantageous|a plus|beneficial)\b/i;

const toNumber = (s: string) => WORD_NUMBERS[s.toLowerCase()] ?? Number.parseInt(s, 10);

type YearsMention = { years: number; soft: boolean; quote: string };

function quoteAround(text: string, index: number, length: number): string {
  // The clause around the match, trimmed to something that fits on a card.
  const start = Math.max(text.lastIndexOf("\n", index), text.lastIndexOf(". ", index) + 1, index - 70, 0);
  const endBreaks = [text.indexOf("\n", index + length), text.indexOf(". ", index + length)].filter((i) => i >= 0);
  const end = Math.min(endBreaks.length ? Math.min(...endBreaks) : text.length, index + length + 70);
  return text
    .slice(start, end)
    .replace(/^[\s•\-–*]+/, "")
    .trim();
}

export function yearsMentions(text: string): YearsMention[] {
  const out: YearsMention[] = [];
  for (const m of text.matchAll(YEARS)) {
    const index = m.index ?? 0;
    const window = text.slice(Math.max(0, index - 40), index + m[0].length + 60);
    const near = text.slice(Math.max(0, index - 15), index + m[0].length + 25);
    if (!EXPERIENCE_NEAR.test(window) || NOT_EXPERIENCE.test(near)) continue;
    // "2-4 years" asks for 2: the lower bound is the requirement.
    const years = toNumber(m[1]);
    if (!Number.isFinite(years) || years > 25) continue;
    const quote = quoteAround(text, index, m[0].length);
    out.push({ years, soft: SOFT.test(quote), quote });
  }
  return out;
}

const verdict = (level: Level, yearsMin: number | null, evidence: string | null): Seniority => ({ level, yearsMin, evidence });

export function classifySeniority(title: string, description: string): Seniority {
  const mentions = yearsMentions(description);
  const hard = mentions.filter((m) => !m.soft);
  const top = hard.length ? hard.reduce((a, b) => (b.years > a.years ? b : a)) : null;
  const yearsMin = top?.years ?? null;

  const earlyTitle = EARLY_TITLE.exec(title);
  // A senior title wins over an early word: "Senior Associate" is not a graduate job.
  const seniorTitle = SENIOR_TITLE.exec(title);
  if (seniorTitle) return verdict("senior", yearsMin, `Title says “${seniorTitle[0].trim()}”`);
  if (LEVEL_THREE_PLUS.test(title)) return verdict("senior", yearsMin, `Title is level ${LEVEL_THREE_PLUS.exec(title)![0].trim()}`);

  if (top && top.years >= 3) return verdict("senior", yearsMin, top.quote);
  if (earlyTitle) {
    // Graduate titles that still ask for 2 years are a stretch, and the card says so.
    if (top && top.years === 2) return verdict("stretch", yearsMin, top.quote);
    return verdict("early", yearsMin, `Title says “${earlyTitle[0].trim()}”`);
  }
  if (top && top.years === 2) return verdict("stretch", yearsMin, top.quote);
  if (LEVEL_TWO.test(title)) return verdict("stretch", yearsMin, `Title is level ${LEVEL_TWO.exec(title)![0]}`);
  if (SOFT_MANAGER.test(title)) return verdict("stretch", yearsMin, "Title says “manager”");

  const earlyText = /\b(graduate (programme|program|scheme|role)|recent graduates?|entry[- ]level|no (prior )?experience (is )?(required|necessary|needed)|0\s*[-–]\s*[12]\s*years?|new grads?|final[- ]year students?|class of 202\d)\b/i.exec(description);
  if (earlyText) return verdict("early", yearsMin, quoteAround(description, earlyText.index, earlyText[0].length));
  if (top) return verdict("open", yearsMin, top.quote);
  return verdict("open", null, null);
}

/** What the deck shows by default. "senior" stays hidden unless the user turns on "show stretch roles" and even then it's labelled. */
export function visibleByDefault(level: Level, showStretch: boolean): boolean {
  if (level === "senior") return false;
  if (level === "stretch") return showStretch;
  return true;
}
