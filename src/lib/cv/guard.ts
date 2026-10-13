import { companyKey } from "../jobs/normalise";
import type { Fact } from "../profile/types";
import type { Answers, Cited, CvBody, Fit, Letter } from "./schema";
import { FIRST_PERSON, houseStyle } from "./style";

// "Gemma judges, code guarantees", applied to a CV. Gemma chooses what to say and
// cites the facts it came from; code drops anything it can't trace back:
//   - a line with no confirmed fact behind it
//   - a number, tool or certification that isn't in the cited facts
//   - a "N years of experience" total (the dates speak for themselves)
//   - anything on the user's never-claim list
//   - a bullet filed under one employer that cites a fact from another
// Every drop is a GuardEvent: the kit shows "Deis removed 2 lines it couldn't back
// up", and Sentry gets the rule name (never the text) tagged with the model.

export type GuardRule =
  | "uncited"
  | "unknown_fact"
  | "unsupported_number"
  | "unsupported_tool"
  | "unsupported_cert"
  | "years_claim"
  | "never_claim"
  | "wrong_employer"
  | "first_person"
  | "unsupported_skill"
  | "fit_demoted"
  | "past_as_present"
  | "work_status";

export type GuardEvent = { rule: GuardRule; text: string; /** For unknown ids: what the model actually cited. */ ids?: string[] };

/** Tools and platforms people get caught out on in interviews. Mentioning one needs a fact that does. */
export const TOOLS = [
  "Python", "Java", "JavaScript", "TypeScript", "C\\+\\+", "C#", "\\.NET", "Golang", "Rust", "Ruby", "PHP", "Kotlin", "Scala", "RStudio",
  "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Snowflake", "BigQuery", "Databricks", "Spark", "Hadoop", "Kafka", "Airflow", "dbt",
  "AWS", "Azure", "GCP", "Google Cloud", "Kubernetes", "Docker", "Terraform", "Ansible", "Jenkins", "GitHub Actions", "CI/CD",
  "React", "Angular", "Vue", "Next\\.js", "Node\\.js", "Django", "Flask", "Spring Boot", "Hibernate", "FastAPI",
  "TensorFlow", "PyTorch", "scikit-learn", "Pandas", "NumPy", "LangChain",
  "Power BI", "Tableau", "Looker", "Excel", "SAP", "Salesforce", "HubSpot", "ServiceNow", "Jira", "Workday", "Dynamics 365", "NetSuite", "Xero", "QuickBooks",
  "Splunk", "Sentinel", "QRadar", "CrowdStrike", "Defender", "SailPoint", "CyberArk", "BeyondTrust", "Okta", "Intune", "Wireshark", "Burp Suite", "Metasploit", "Nessus",
  "Figma", "Adobe Photoshop", "Illustrator", "InDesign", "Premiere Pro", "AutoCAD", "SolidWorks", "MATLAB", "SPSS", "Stata", "LabVIEW",
  "Linux", "Windows Server", "Active Directory", "PowerShell", "Bash",
];
const TOOL_RE = new RegExp(`(?<![\\w.+#])(${TOOLS.join("|")})(?![\\w+#])`, "g");

/** Certifications are the classic invented claim. */
export const CERTS = [
  "CISSP", "CISM", "CISA", "CRISC", "CEH", "OSCP", "Security\\+", "Network\\+", "A\\+", "CompTIA", "CCNA", "CCNP", "CCSP", "GIAC", "GSEC",
  "ISO\\s*27001 Lead (?:Auditor|Implementer)", "PMP", "PRINCE2", "CAPM", "ITIL", "Certified Scrum Master", "Six Sigma",
  "AWS Certified", "Azure (?:Fundamentals|Administrator|Solutions Architect)", "AZ-\\d{3}", "Google Cloud Certified",
  "ACCA", "ACA", "CIMA", "CFA", "CPA", "FRM", "QFA", "CIPD", "CIPP",
];
const CERT_RE = new RegExp(`(?<![\\w+])(${CERTS.join("|")})(?![\\w+])`, "gi");
const IS_CERT = new RegExp(CERT_RE.source, "i");

/** "Currently pursuing an MSc" when the MSc ended last year: small models get tense wrong. */
const CURRENTLY = /\b(currently|now)\s+(pursuing|studying|completing|enrolled|undertaking|doing|working towards|reading)\b|\bexpected (to graduate|graduation)\b/i;
/** Visas, stamps and sponsorship are facts about the user's status that only the check-in knows. A model guessing them can cost someone the job. */
export const WORK_STATUS = /\b(visa|sponsor(ship|ed)?|stamp\s*[0-9][a-z]?|work permit|employment permit|critical skills|right to work|eligible to work|authori[sz]ed to work|citizen(ship)?|immigration)\b/i;
/** A sentence that admits a gap may name the posting's tools: "I haven't used Java professionally yet". */
const ADMITS_GAP = /\b(not|n['’]t|no|yet|learn(ing)?|developing|new to|build(ing)? up|close (the|this|that) gap|gap)\b/i;

const YEARS_CLAIM = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\+?\s*(?:years?|yrs?)['’]?\s*(?:of\s+)?(?:experience|expertise|background)/i;
const NUMBER_RE = /(?<![\w.])\d[\d,]*(?:\.\d+)?/g;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
/** Models copy the prompt's "[ab5]" format back, sometimes with the whole fact line after it; the id is the first token. */
export function cleanId(raw: string): string {
  // Fact ids look like "ab5", "rm11" or "fk3x9a07": letters, then letters or digits, ending in a digit.
  const ID = /[a-z][a-z0-9]{0,10}\d/i;
  const inBrackets = [...raw.matchAll(/[[(]([^\])]+)[\])]/g)].map((m) => ID.exec(m[1])?.[0]).find(Boolean);
  const id = inBrackets ?? ID.exec(raw)?.[0];
  return (id ?? raw.trim().split(/[\s(,;:]/)[0].replace(/[^\w-]/g, "")).toLowerCase();
}

/** Trim to a length at a word boundary, for model text that ran long. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  return end > max * 0.6 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}
const cleanIds = (ids: string[]) => [...new Set(ids.map(cleanId).filter(Boolean))];
const digits = (s: string) => s.replace(/,/g, "");

export type Ledger = { byId: Map<string, Fact>; confirmed: Fact[]; neverClaim: string[] };

export function ledger(facts: Fact[], neverClaim: string[]): Ledger {
  const confirmed = facts.filter((f) => f.confirmed);
  return { byId: new Map(confirmed.map((f) => [f.id, f])), confirmed, neverClaim: neverClaim.map((n) => n.trim()).filter(Boolean) };
}

function factText(f: Fact): string {
  return [f.text, f.org, f.title, f.start, f.end, f.where].filter(Boolean).join(" · ");
}

export type WhyNotOptions = {
  requireFacts?: boolean;
  /** CV lines: no first person. Letters and answers are first person. */
  cv?: boolean;
  /** The posting itself: letters may quote its dates and durations, and name its tools when admitting a gap. */
  posting?: string;
  now?: Date;
};

/** Why a cited line can't stay, or null when it can. */
export function whyNot(text: string, rawIds: string[], l: Ledger, opts: WhyNotOptions = {}): GuardRule | null {
  const { requireFacts = true, cv = true } = opts;
  const posting = norm(opts.posting ?? "");
  const factIds = cleanIds(rawIds);
  const cited = factIds.map((id) => l.byId.get(id)).filter((f): f is Fact => Boolean(f));
  if (factIds.length && cited.length < factIds.length) return "unknown_fact";
  if (requireFacts && !cited.length) return "uncited";
  const source = norm(cited.map(factText).join(" \n "));
  const sourceDigits = digits(source);

  for (const phrase of l.neverClaim) if (phrase.length > 2 && norm(text).includes(norm(phrase))) return "never_claim";
  if (WORK_STATUS.test(text)) return "work_status";

  if (CURRENTLY.test(text)) {
    const year = (opts.now ?? new Date()).getFullYear();
    const study = cited.filter((f) => f.kind === "education");
    const stillGoing = study.some((f) => !f.end || /present|current/i.test(f.end) || Number.parseInt(f.end, 10) >= year);
    if (study.length && !stillGoing) return "past_as_present";
  }

  const years = YEARS_CLAIM.exec(text);
  if (years && !source.includes(norm(years[0]))) return "years_claim";

  for (const m of text.matchAll(NUMBER_RE)) {
    const n = digits(m[0]);
    // Calendar years are dates, and dates come from the facts' own start/end.
    if (/^(19|20)\d{2}$/.test(n) && source.includes(n)) continue;
    const exact = new RegExp(`(?<![\\d.])${n.replace(".", "\\.")}(?![\\d])`);
    if (exact.test(sourceDigits)) continue;
    if (!cv && posting && exact.test(digits(posting))) continue;
    return "unsupported_number";
  }
  for (const m of text.matchAll(CERT_RE)) if (!source.includes(norm(m[0]))) return "unsupported_cert";
  for (const m of text.matchAll(TOOL_RE)) {
    if (new RegExp(`(?<![\\w.+#])${m[0].replace(/[.+#]/g, "\\$&")}(?![\\w+#])`, "i").test(source)) continue;
    // A letter may name a tool it doesn't claim: only in a sentence that admits the gap.
    const sentence = text.slice(text.lastIndexOf(".", m.index ?? 0) + 1, text.indexOf(".", m.index ?? 0) + 1 || undefined);
    if (!cv && ADMITS_GAP.test(sentence)) continue;
    return "unsupported_tool";
  }
  if (cv && FIRST_PERSON.test(text)) return "first_person";
  return null;
}

/** "…from 41% to 68% [ab7]." → "…from 41% to 68%." The ids live in `facts`, not the prose. */
export const stripCitations = (s: string) => s.replace(/\s*\[(?:\s*[a-z]{1,3}\d[\w-]*\s*,?)+\]/gi, "").replace(/\s*\((?:\s*[a-z]{1,3}\d[\w-]*\s*,?)+\)/gi, "");

/** Fact ids a model wrote inline, in [ab5] or (ab5, ab6) form. */
export const inlineIds = (s: string) => [...s.matchAll(/[[(]((?:\s*[a-z]{1,3}\d[\w-]*\s*,?)+)[\])]/gi)].flatMap((m) => m[1].split(/[,\s]+/)).filter(Boolean);

/** "One. Two? Three." → ["One.", "Two?", "Three."], without splitting "e.g." or "3.5". */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"“(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Guard sentence by sentence: one invented claim costs that sentence, not the whole
 * paragraph. Citation and fact checks still use the item's cited facts.
 */
export function keepSentences(text: string, facts: string[], l: Ledger, events: GuardEvent[], opts?: WhyNotOptions): string | null {
  const clean = houseStyle(stripCitations(text));
  // Ids that don't exist are ignored; what's left has to back the line on its own.
  const ids = cleanIds(facts);
  const known = ids.filter((id) => l.byId.has(id));
  if ((opts?.requireFacts ?? true) && !known.length) {
    events.push({ rule: ids.length ? "unknown_fact" : "uncited", text, ...(ids.length ? { ids: facts.slice(0, 4) } : {}) });
    return null;
  }
  const kept = splitSentences(clean).filter((sentence) => {
    const rule = whyNot(sentence, known, l, opts);
    if (rule) events.push({ rule, text: sentence });
    return !rule;
  });
  return kept.length ? kept.join(" ") : null;
}

function keep<T extends Cited>(items: T[], l: Ledger, events: GuardEvent[], opts?: WhyNotOptions): T[] {
  const out: T[] = [];
  for (const item of items) {
    const text = keepSentences(item.text, item.facts, l, events, opts);
    if (text) out.push({ ...item, text, facts: cleanIds(item.facts).filter((id) => l.byId.has(id)) });
  }
  return out;
}

const sameOrg = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && companyKey(a) === companyKey(b));

export function guardCv(body: CvBody, l: Ledger): { body: CvBody; events: GuardEvent[] } {
  const events: GuardEvent[] = [];
  const roleOrgs = [...new Set(l.confirmed.filter((f) => f.kind === "role" && f.org).map((f) => f.org as string))];

  const roles = body.roles
    .map((r) => {
      const org = roleOrgs.find((o) => sameOrg(o, r.org));
      if (!org) {
        for (const b of r.bullets) events.push({ rule: "wrong_employer", text: b.text });
        return null;
      }
      const bullets = keep(r.bullets, l, events).filter((b) => {
        const foreign = cleanIds(b.facts)
          .map((id) => l.byId.get(id))
          .find((f) => f?.org && !sameOrg(f.org, org));
        if (foreign) events.push({ rule: "wrong_employer", text: b.text });
        return !foreign;
      });
      return { org, bullets };
    })
    .filter((r): r is { org: string; bullets: Cited[] } => Boolean(r));

  const competencies = body.competencies
    .map((c) => ({ ...c, text: houseStyle(stripCitations(c.text)), label: houseStyle(c.label), facts: cleanIds(c.facts) }))
    .filter((c) => {
      const rule = whyNot(`${c.label}: ${c.text}`, c.facts, l);
      if (rule) events.push({ rule, text: `${c.label}: ${c.text}` });
      return !rule;
    });

  const everything = norm(l.confirmed.map(factText).join(" \n "));
  const skills = [...new Set(body.skills.map((s) => houseStyle(stripCitations(s)).trim()).filter(Boolean))].filter((s) => {
    const ok = everything.includes(norm(s)) || norm(s).split(/[\s/,&]+/).every((w) => w.length < 3 || everything.includes(w));
    if (!ok) events.push({ rule: "unsupported_skill", text: s });
    return ok && !IS_CERT.test(s);
  });

  return {
    body: {
      summary: keep(body.summary, l, events),
      competencies,
      roles,
      projects: keep(body.projects, l, events),
      achievements: keep(body.achievements, l, events),
      skills: skills.slice(0, 30),
    },
    events,
  };
}

/** Cover letters are first person, and the opening and closing lines can be uncited, but they still can't invent. */
export function guardLetter(letter: Letter, l: Ledger, posting = ""): { letter: Letter; events: GuardEvent[] } {
  const events: GuardEvent[] = [];
  const paragraphs = keep(letter.paragraphs, l, events, { requireFacts: false, cv: false, posting });
  return { letter: { paragraphs }, events };
}

export function guardAnswers(a: Answers, l: Ledger, posting = ""): { answers: Answers; events: GuardEvent[] } {
  const events: GuardEvent[] = [];
  const answers = a.answers.map((x) => {
    if (x.needsYou) return { ...x, answer: "", facts: [] };
    const text = keepSentences(x.answer, x.facts, l, events, { requireFacts: false, cv: false, posting });
    if (!text) return { ...x, answer: "", facts: [], needsYou: true };
    return { ...x, answer: text, facts: cleanIds(x.facts).filter((id) => l.byId.has(id)) };
  });
  return { answers: { answers }, events };
}

/** A "strong" or "transferable" match needs real facts behind it, or it's a gap. */
export function guardFit(fit: Fit, l: Ledger): { fit: Fit; events: GuardEvent[] } {
  const events: GuardEvent[] = [];
  // Right to work is decided by code from the posting and the user's own status, never by the model.
  const kept = fit.requirements.filter((r) => {
    if (!WORK_STATUS.test(r.need)) return true;
    events.push({ rule: "work_status", text: r.need });
    return false;
  });
  const requirements = kept.slice(0, 10).map((r) => {
    const facts = cleanIds(r.facts).filter((id) => l.byId.has(id));
    if (r.match !== "gap" && !facts.length) {
      events.push({ rule: "fit_demoted", text: r.need });
      return { ...r, match: "gap" as const, facts: [], note: r.note };
    }
    return { ...r, facts, need: clip(houseStyle(stripCitations(r.need)), 200), note: clip(houseStyle(stripCitations(r.note)), 320) };
  });
  return { fit: { ...fit, requirements, angle: clip(houseStyle(fit.angle), 300) }, events };
}
