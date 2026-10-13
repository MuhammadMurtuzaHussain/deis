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
  | "fit_demoted";

export type GuardEvent = { rule: GuardRule; text: string };

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

const YEARS_CLAIM = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\+?\s*(?:years?|yrs?)['’]?\s*(?:of\s+)?(?:experience|expertise|background)/i;
const NUMBER_RE = /(?<![\w.])\d[\d,]*(?:\.\d+)?/g;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
const digits = (s: string) => s.replace(/,/g, "");

export type Ledger = { byId: Map<string, Fact>; confirmed: Fact[]; neverClaim: string[] };

export function ledger(facts: Fact[], neverClaim: string[]): Ledger {
  const confirmed = facts.filter((f) => f.confirmed);
  return { byId: new Map(confirmed.map((f) => [f.id, f])), confirmed, neverClaim: neverClaim.map((n) => n.trim()).filter(Boolean) };
}

function factText(f: Fact): string {
  return [f.text, f.org, f.title, f.start, f.end, f.where].filter(Boolean).join(" · ");
}

/** Why a cited line can't stay, or null when it can. */
export function whyNot(text: string, factIds: string[], l: Ledger, opts: { requireFacts?: boolean; cv?: boolean } = {}): GuardRule | null {
  const { requireFacts = true, cv = true } = opts;
  const cited = factIds.map((id) => l.byId.get(id)).filter((f): f is Fact => Boolean(f));
  if (factIds.length && cited.length < factIds.length) return "unknown_fact";
  if (requireFacts && !cited.length) return "uncited";
  const source = norm(cited.map(factText).join(" \n "));
  const sourceDigits = digits(source);

  for (const phrase of l.neverClaim) if (phrase.length > 2 && norm(text).includes(norm(phrase))) return "never_claim";

  const years = YEARS_CLAIM.exec(text);
  if (years && !source.includes(norm(years[0]))) return "years_claim";

  for (const m of text.matchAll(NUMBER_RE)) {
    const n = digits(m[0]);
    // Calendar years are dates, and dates come from the facts' own start/end.
    if (/^(19|20)\d{2}$/.test(n) && source.includes(n)) continue;
    if (!new RegExp(`(?<![\\d.])${n.replace(".", "\\.")}(?![\\d])`).test(sourceDigits)) return "unsupported_number";
  }
  for (const m of text.matchAll(CERT_RE)) if (!source.includes(norm(m[0]))) return "unsupported_cert";
  for (const m of text.matchAll(TOOL_RE)) if (!new RegExp(`(?<![\\w.+#])${m[0].replace(/[.+#]/g, "\\$&")}(?![\\w+#])`, "i").test(source)) return "unsupported_tool";
  if (cv && FIRST_PERSON.test(text)) return "first_person";
  return null;
}

function keep<T extends Cited>(items: T[], l: Ledger, events: GuardEvent[], opts?: Parameters<typeof whyNot>[3]): T[] {
  const out: T[] = [];
  for (const item of items) {
    const text = houseStyle(item.text);
    const rule = whyNot(text, item.facts, l, opts);
    if (rule) events.push({ rule, text: item.text });
    else out.push({ ...item, text });
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
        const foreign = b.facts.map((id) => l.byId.get(id)).find((f) => f?.org && !sameOrg(f.org, org));
        if (foreign) events.push({ rule: "wrong_employer", text: b.text });
        return !foreign;
      });
      return { org, bullets };
    })
    .filter((r): r is { org: string; bullets: Cited[] } => Boolean(r));

  const competencies = body.competencies
    .map((c) => ({ ...c, text: houseStyle(c.text), label: houseStyle(c.label) }))
    .filter((c) => {
      const rule = whyNot(`${c.label}: ${c.text}`, c.facts, l);
      if (rule) events.push({ rule, text: `${c.label}: ${c.text}` });
      return !rule;
    });

  const everything = norm(l.confirmed.map(factText).join(" \n "));
  const skills = [...new Set(body.skills.map((s) => s.trim()).filter(Boolean))].filter((s) => {
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
      skills,
    },
    events,
  };
}

/** Cover letters are first person, and the opening and closing lines can be uncited, but they still can't invent. */
export function guardLetter(letter: Letter, l: Ledger): { letter: Letter; events: GuardEvent[] } {
  const events: GuardEvent[] = [];
  const paragraphs = keep(letter.paragraphs, l, events, { requireFacts: false, cv: false });
  return { letter: { paragraphs }, events };
}

export function guardAnswers(a: Answers, l: Ledger): { answers: Answers; events: GuardEvent[] } {
  const events: GuardEvent[] = [];
  const answers = a.answers.map((x) => {
    if (x.needsYou) return { ...x, answer: "", facts: [] };
    const text = houseStyle(x.answer);
    const rule = whyNot(text, x.facts, l, { requireFacts: false, cv: false });
    if (rule) {
      events.push({ rule, text: x.answer });
      return { ...x, answer: "", facts: [], needsYou: true };
    }
    return { ...x, answer: text };
  });
  return { answers: { answers }, events };
}

/** A "strong" or "transferable" match needs real facts behind it, or it's a gap. */
export function guardFit(fit: Fit, l: Ledger): { fit: Fit; events: GuardEvent[] } {
  const events: GuardEvent[] = [];
  const requirements = fit.requirements.map((r) => {
    const facts = r.facts.filter((id) => l.byId.has(id));
    if (r.match !== "gap" && !facts.length) {
      events.push({ rule: "fit_demoted", text: r.need });
      return { ...r, match: "gap" as const, facts: [], note: r.note };
    }
    return { ...r, facts, need: houseStyle(r.need), note: houseStyle(r.note) };
  });
  return { fit: { ...fit, requirements, angle: houseStyle(fit.angle) }, events };
}
