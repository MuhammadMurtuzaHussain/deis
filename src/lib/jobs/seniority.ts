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
const ROLE_WORD = String.raw`(?:engineer|developer|analyst|scientist|designer|consultant|specialist|associate|administrator)`;
const LEVEL_THREE_PLUS = new RegExp(String.raw`\b(iii|iv|l[4-9]|level [3-9])\b|\b${ROLE_WORD}\s+([3-9])\b`, "i");
const LEVEL_TWO = new RegExp(String.raw`\b(ii|l3|level 2)\b|\b${ROLE_WORD}\s+2\b`, "i");
/** "Manager, Sales Development" names a team to run: a people-manager role. */
const PEOPLE_MANAGER = /^\s*manager\s*,/i;
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
// "5 years' experience". Requirement-style phrasing (a plus, a minimum, a range) counts on
// its own; a bare "3 years" needs an experience word nearby. The words right around the
// number rule out "a 2 year programme", "within 3 years", "IPO in over 20 years".
const YEARS = new RegExp(
  String.raw`(?:\b(minimum(?: of)?|at least|over|more than)\s+)?\b${NUM}\s*(\+|plus|or more)?\s*(?:(-|–|to)\s*${NUM}\s*\+?\s*)?(?:years?|yrs?)(?:['’]s?)?\b`,
  "gi",
);
const EXPERIENCE_NEAR = /experience|exp\b|background|track record|working in|in (a|an) (similar|related)|professional|hands-on/i;
const NOT_AFTER = /^[\s-]*(?:of\s+age|old\b|ago\b|warranty|guarantee|(?:(?:graduate|rotational|training|apprenticeship|degree)\s+)?(?:programme|program(?!\s*manage)|contract|course|degree|fixed[- ]term|placement|internship))/i;
const NOT_BEFORE = /(?:(?:your|the) first|within|over the (?:next|past|last)|in the (?:next|past|last)|founded|since|for the (?:next|past|last)|(?:over|for) a period of|period of|duration of|lasting|takes(?: about)?|study for)\s*$/i;
const SOFT = /\b(preferred|desirable|ideally|nice to have|bonus|advantage|advantageous|a plus|beneficial)\b/i;

const toNumber = (s: string) => WORD_NUMBERS[s.toLowerCase()] ?? Number.parseInt(s, 10);

type YearsMention = { years: number; soft: boolean; quote: string };

/** Where list items were glued together ("…sponsorshipProficiency with…"); product names like TensorFlow aren't. */
const GLUED = /(?<=[a-z]{6})(?=[A-Z][a-z]{4,}\b)/g;
const CAMEL_NAMES = /^(?:TensorFlow|SuccessFactors|ElasticSearch|BeyondTrust|CloudFormation|ActiveDirectory|PeopleSoft|SolarWinds)$/;
function gluePoints(text: string, from: number, to: number): number[] {
  const out: number[] = [];
  // Start a little early: the glue point needs the six letters before it.
  const base = Math.max(0, from - 6);
  for (const m of text.slice(base, to).matchAll(GLUED)) {
    const at = base + (m.index ?? 0);
    if (at < from) continue;
    const word = /[A-Za-z]+$/.exec(text.slice(Math.max(0, at - 20), at))?.[0] + (/^[A-Za-z]+/.exec(text.slice(at))?.[0] ?? "");
    if (!CAMEL_NAMES.test(word)) out.push(at);
  }
  return out;
}

/**
 * The sentence or list item around a match, for quoting on a card. Long ones are cut on a word
 * boundary with "…", never mid-word.
 */
export function quoteAround(text: string, index: number, length: number, reach = 70): string {
  const after = index + length;
  const dot = text.lastIndexOf(". ", index);
  let start = Math.max(text.lastIndexOf("\n", index) + 1, dot >= 0 ? dot + 2 : 0, ...gluePoints(text, Math.max(0, index - reach * 2), index));
  const ends = [text.indexOf("\n", after), text.indexOf(". ", after) + 1, ...gluePoints(text, after, after + reach * 2)].filter((i) => i > 0 && i >= after);
  let end = ends.length ? Math.min(...ends) : text.length;
  let lead = "";
  let tail = "";
  if (index - start > reach) {
    const space = text.indexOf(" ", index - reach);
    start = space >= 0 && space < index ? space + 1 : index;
    lead = "…";
  }
  if (end - after > reach) {
    const space = text.lastIndexOf(" ", after + reach);
    end = space > after ? space : after + reach;
    tail = "…";
  }
  const quote = text.slice(start, end).replace(/^[\s•\-–*]+/, "").trim();
  return `${lead}${tail ? quote.replace(/[\s,;:–-]+$/, "") : quote}${tail}`;
}

export function yearsMentions(text: string): YearsMention[] {
  const out: YearsMention[] = [];
  for (const m of text.matchAll(YEARS)) {
    const index = m.index ?? 0;
    const end = index + m[0].length;
    const [, qualifier, num, plus, range] = m;
    const before = text.slice(Math.max(0, index - 30), index);
    if (NOT_AFTER.test(text.slice(end, end + 40)) || NOT_BEFORE.test(before)) continue;
    // "the first IPO in over 20 years" is company history, not a requirement.
    if (qualifier?.toLowerCase() === "over" && /\b(in|for)\s*$/i.test(before)) continue;
    const requirement = Boolean(plus || range || (qualifier && qualifier.toLowerCase() !== "over"));
    const window = text.slice(Math.max(0, index - 60), end + 60);
    if (!requirement && !EXPERIENCE_NEAR.test(window)) continue;
    // "2-4 years" asks for 2: the lower bound is the requirement.
    const years = toNumber(num);
    if (!Number.isFinite(years) || years > 25) continue;
    const quote = quoteAround(text, index, m[0].length);
    // "3+ years preferred" or "ideally 3 years" is soft; "5+ years of X, ideally in Y" is not.
    const clauseStart = Math.max(text.lastIndexOf("\n", index), text.lastIndexOf(". ", index), index - 60);
    const soft = SOFT.test(text.slice(clauseStart, index)) || SOFT.test(text.slice(end, end + 30));
    out.push({ years, soft, quote });
  }
  return out;
}

// Internships and placements mostly need you to be enrolled: "a minimum of one semester remaining",
// "returning to full-time studies". A graduate can't take them, so their deck hides them.
const STUDENT_TITLE =
  /\b(?:intern(?:ship)?s?|(?:industrial |work |student )?placement(?! (?:consultant|coordinator|officer|manager|specialist))|co-?op|summer (?:analyst|associate|student|intern|engineer)s?|year in industry|working student|werkstudent)\b/i;
const STUDENT_TEXT =
  /\b(?:currently enrolled|current(?:ly)? enrol(?:l)?ment|returning to (?:your )?(?:full[- ]time )?(?:studies|university|college|school|education)|return to (?:your )?(?:full[- ]time )?(?:studies|university|college)|must be (?:a |an )?(?:current |full[- ]time |registered |enrolled )?(?:student|undergraduate|enrolled)|(?:semester|term|year)s? remaining (?:in|of|at) (?:your )?(?:university|college|studies|degree)|in the process of (?:receiving|completing|obtaining) (?:a|an|your) (?:bachelor|master|degree))/i;
const OPEN_TO_GRADUATES = /\b(?:recent(?:ly)? graduat(?:es?|ed)|new grads?|graduated (?:in|within)|graduates (?:are )?(?:welcome|eligible)|open to graduates)\b/i;

/** Only for people still studying: an intern, placement or co-op title, or text that asks for current enrolment. */
export function studentOnly(title: string, description: string): boolean {
  // "Graduate Intern" schemes and "New Grad" roles take graduates.
  if (/\b(?:graduate|new grads?)\b/i.test(title)) return false;
  const asksEnrolment = STUDENT_TEXT.test(description);
  if (!asksEnrolment && OPEN_TO_GRADUATES.test(description)) return false;
  return asksEnrolment || STUDENT_TITLE.test(title);
}

export function classifySeniority(title: string, description: string): Seniority {
  const student = studentOnly(title, description);
  const verdict = (level: Level, yearsMin: number | null, evidence: string | null): Seniority => ({ level, yearsMin, evidence, studentOnly: student });
  const mentions = yearsMentions(description);
  const hard = mentions.filter((m) => !m.soft);
  const top = hard.length ? hard.reduce((a, b) => (b.years > a.years ? b : a)) : null;
  const yearsMin = top?.years ?? null;

  const earlyTitle = EARLY_TITLE.exec(title);
  // A senior title wins over an early word: "Senior Associate" is not a graduate job.
  const seniorTitle = SENIOR_TITLE.exec(title);
  if (seniorTitle) return verdict("senior", yearsMin, `Title says “${seniorTitle[0].trim()}”`);
  if (PEOPLE_MANAGER.test(title)) return verdict("senior", yearsMin, "A people-manager role");
  if (LEVEL_THREE_PLUS.test(title)) return verdict("senior", yearsMin, `Title is level ${LEVEL_THREE_PLUS.exec(title)![0].trim()}`);

  // Safety rule: a graduate, trainee or intern title is only hidden by a line that really asks for
  // experience. "Complete the ACA over 3-4 years" once hid a trainee job (held-out eval, 13 Oct).
  if (top && top.years >= 3 && !(earlyTitle && !/experience/i.test(top.quote))) return verdict("senior", yearsMin, top.quote);
  if (earlyTitle) {
    // Graduate titles that still ask for 2 years of experience are a stretch, and the card says so.
    // Same safety rule as above: "rotations during your first two years" or "a driving licence
    // held for more than two years" don't make a graduate programme a stretch (16 Oct feed).
    if (top && top.years === 2 && /experience/i.test(top.quote)) return verdict("stretch", yearsMin, top.quote);
    return verdict("early", yearsMin, `Title says “${earlyTitle[0].trim()}”`);
  }
  if (top && top.years === 2) return verdict("stretch", yearsMin, top.quote);

  // The posting's own words ("recent graduates welcome") beat a numbered level in the title.
  const earlyText = /\b(graduate (programme|program|scheme|role)|recent graduates?|entry[- ]level|no (prior )?experience (is )?(required|necessary|needed)|0\s*[-–]\s*[12]\s*years?|new grads?|final[- ]year students?|class of 202\d)\b/i.exec(description);
  if (earlyText) return verdict("early", yearsMin, quoteAround(description, earlyText.index, earlyText[0].length));
  if (LEVEL_TWO.test(title)) return verdict("stretch", yearsMin, `Title is level ${LEVEL_TWO.exec(title)![0]}`);
  if (SOFT_MANAGER.test(title)) return verdict("stretch", yearsMin, "Title says “manager”");
  if (top) return verdict("open", yearsMin, top.quote);
  return verdict("open", null, null);
}

/** What the deck shows by default. "senior" stays hidden unless the user turns on "show stretch roles" and even then it's labelled. */
export function visibleByDefault(level: Level, showStretch: boolean): boolean {
  if (level === "senior") return false;
  if (level === "stretch") return showStretch;
  return true;
}
