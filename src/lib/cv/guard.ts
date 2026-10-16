import { companyKey } from "../jobs/normalise";
import { isFinished } from "../profile/dates";
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
//   - led, managed, presented and the like when the cited facts don't say so
//   - a letter sentence copied from the posting
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
  | "work_status"
  | "added_claim"
  | "posting_copy";

export type GuardEvent = { rule: GuardRule; text: string; /** For unknown ids: what the model actually cited. */ ids?: string[] };
/** A sentence kept because a fact from the same employer backs what the model under-cited. Reported, never shown as a removal. */
export type GuardRepair = { rule: "cite_repaired"; text: string; ids: string[] };

/** Tools and platforms people get caught out on in interviews. Mentioning one needs a fact that does. Matched in any case. */
export const TOOLS = [
  "Python", "Java", "JavaScript", "TypeScript", "C\\+\\+", "C#", "\\.NET", "Golang", "Rust", "Ruby", "Ruby on Rails", "PHP", "Kotlin", "Scala", "Swift", "SwiftUI", "Objective-C", "Flutter", "Perl", "Haskell", "COBOL", "Fortran", "RStudio", "VBA", "SAS",
  "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Oracle", "Snowflake", "BigQuery", "Databricks", "Spark", "PySpark", "Hadoop", "Kafka", "Airflow", "dbt", "Elasticsearch", "Firebase", "Supabase", "GraphQL",
  "AWS", "Azure", "GCP", "Google Cloud", "Kubernetes", "OpenShift", "Docker", "Terraform", "Ansible", "Jenkins", "Git", "GitHub", "GitHub Actions", "GitLab", "Bitbucket", "CI/CD", "Prometheus", "Grafana", "Datadog",
  "React", "Angular", "Vue", "Svelte", "jQuery", "Next\\.js", "Node\\.js", "Django", "Flask", "Laravel", "Spring Boot", "Hibernate", "FastAPI", "WordPress", "Shopify",
  "Jest", "Cypress", "Selenium", "Playwright", "JUnit", "pytest", "Postman",
  "TensorFlow", "PyTorch", "Keras", "scikit-learn", "Pandas", "NumPy", "Matplotlib", "Seaborn", "Plotly", "Streamlit", "Jupyter", "OpenCV", "spaCy", "NLTK", "LangChain",
  "Power BI", "Power Automate", "Power Apps", "SharePoint", "Tableau", "Looker", "Qlik", "Alteryx", "SSIS", "SSRS", "Excel", "Google Analytics", "SAP", "Salesforce", "HubSpot", "Mailchimp", "Zendesk", "ServiceNow", "Jira", "Workday", "Dynamics 365", "NetSuite", "Xero", "QuickBooks", "Sage",
  "Splunk", "Sentinel", "QRadar", "CrowdStrike", "Defender", "SailPoint", "CyberArk", "BeyondTrust", "Okta", "Intune", "Wireshark", "Burp Suite", "Metasploit", "Nessus", "Nmap", "Ghidra",
  "Figma", "Canva", "Adobe Photoshop", "Illustrator", "InDesign", "Premiere Pro", "AutoCAD", "Revit", "SolidWorks", "ANSYS", "ArcGIS", "QGIS", "MATLAB", "Simulink", "SPSS", "Stata", "LabVIEW", "Arduino", "Raspberry Pi", "Verilog", "VHDL", "Unreal Engine",
  "Linux", "Windows Server", "Active Directory", "PowerShell", "Bash",
];
/** Tools that are also everyday words ("excel at", "react to", "a swift reply"): only the capitalised form counts. */
const WORD_TOOLS = new Set(
  "excel react swift spark rust ruby jest workday snowflake defender sentinel illustrator looker bash flask airflow hibernate angular selenium sage oracle flutter cypress postman playwright prometheus".split(" "),
);
const TOOL_RE = new RegExp(`(?<![\\w.+#])(${TOOLS.join("|")})(?![\\w+#])`, "gi");
/**
 * Tools the list doesn't know, by their shape: an inner capital (PyTorch, macOS), a capitalised
 * acronym with a tail (SQLite), a .js/.NET name, or a + or # suffix (F#). Supported by any
 * confirmed fact, since company and society names have the same shape.
 */
const TOOL_SHAPE = /(?<![\w.+#'’-])(?:[A-Za-z]*[a-z][A-Z][A-Za-z0-9]*|[A-Z]{2,}[a-z][A-Za-z0-9]*|[A-Za-z][A-Za-z0-9]*\.(?:js|ts|io|NET|py)|[A-Za-z]{1,6}(?:\+\+|#))(?![\w+#])/g;
/** Shapes that aren't tools: degrees, plural acronyms, Irish and Scottish surnames, and a few everyday names. */
const NOT_A_TOOL =
  /^(?:(?:B|M|Ph|D|H|PG|Pg|LL)(?:Sc|A|Eng|Tech|Comm?|Phil|Dip|Res|Mus|Arch|Ed|Cert|D|M|B|SocSc|BS|Sci)s?|[A-Z]{2,}s|(?:Mc|Mac|Fitz|Nic|Mhic|Ní|De|Di|Da|La|Le|Van|Von)[A-Z]\w*|SaaS|PaaS|IaaS|IoT|RESTful|(?:Fin|Ed|Med|Health|Prop|Reg|Insur|Agri|Gov|Bio|Clean)Tech|eCommerce|eLearning|LinkedIn|YouTube|iPhone|iPad|PwC|WhatsApp|TikTok|PayPal|eBay)$/;

/** Certifications are the classic invented claim. */
export const CERTS = [
  "CISSP", "CISM", "CISA", "CRISC", "CEH", "OSCP", "Security\\+", "Network\\+", "A\\+", "CompTIA", "CCNA", "CCNP", "CCSP", "GIAC", "GSEC",
  "ISO\\s*27001 Lead (?:Auditor|Implementer)", "PMP", "PRINCE2", "CAPM", "ITIL", "Certified Scrum Master", "Six Sigma",
  "AWS Certified", "Azure (?:Fundamentals|Administrator|Solutions Architect)", "AZ-\\d{3}", "Google Cloud Certified",
  "ACCA", "ACA", "CIMA", "CFA", "CPA", "FRM", "QFA", "CIPD", "CIPP",
];
const CERT_RE = new RegExp(`(?<![\\w+])(${CERTS.join("|")})(?![\\w+])`, "gi");
const IS_CERT = new RegExp(CERT_RE.source, "i");

const DEGREE = String.raw`(?:BSc|BA|BEng|BTech|BComm?|BCL|BBS|LLB|LLM|MSc|MA|MEng|MTech|MBA|MPhil|MRes|PhD|H\.?Dip|PGDip|degree|master['’]?s|bachelor['’]?s|diploma|doctorate|studies)`;
/** "Currently pursuing an MSc", "final-year student", "is preparing me" when the degree has ended: small models get tense wrong. */
const CURRENTLY = new RegExp(
  [
    String.raw`\b(?:currently|now)\s+(?:pursuing|studying|completing|enrolled|undertaking|working towards|reading)\b`,
    String.raw`\b(?:currently|now)\s+(?:doing|taking)\s+(?:a|an|my|the)\s+(?:[\w-]+\s+){0,3}?${DEGREE}\b`,
    // Not "interested in pursuing a master's" or "while pursuing a BSc, worked…": those aren't claims to be studying now.
    String.raw`(?<!\b(?:in|to|of|by|before|after|while|whilst|considering|consider)\s)\bpursuing\s+(?:a|an|my|the|his|her|their)\s+(?:[\w-]+\s+){0,3}?${DEGREE}\b`,
    String.raw`\bexpect(?:ed|s|ing)? (?:to graduate|graduation)\b|\b(?:will|due to) graduate\b|(?<!(?:after|since|before|upon|on)\s)\bgraduating (?:in|this|next)\b`,
    String.raw`\bfinal[- ]year\s+(?:[\w-]+\s+){0,3}?(?:student|undergraduate)s?\b|\bcurrent (?:student|undergraduate)\b|\b(?:currently|now|still) in (?:(?:my|the|her|his|their)\s+)?(?:final|last|second|third|fourth) year\b`,
    // "My current MSc", "my ongoing studies", "due to finish in 2026", "Studying for a BSc".
    String.raw`\b(?:current|ongoing|present)\s+(?:[\w-]+\s+)?${DEGREE}\b|\bdue to (?:finish|complete)\b`,
    String.raw`(?<!\b(?:while|whilst|when|before|after|since)\s)\bstudying\s+(?:for|towards)\s+(?:a|an|my|the)\s+(?:[\w-]+\s+){0,3}?${DEGREE}\b`,
    String.raw`\b(?:studies|degree|course|programme)\s+(?:is|are)\s+(?:still\s+)?(?:ongoing|in progress)\b`,
    String.raw`\b(?:is|are) preparing me\b|\b(?:am|is|are)\s+(?:currently\s+|still\s+)?(?:studying|enrolled|undertaking)\b|\bstill (?:studying|at (?:university|college))\b`,
  ].join("|"),
  "i",
);
/**
 * Visas, stamps, sponsorship and passports are facts about the user's status that only the
 * check-in knows. A model guessing them can cost someone the job. Sponsorship counts in every
 * sense but a society's: "secured a corporate sponsor" or "event sponsorship" is fine.
 */
export const WORK_STATUS = new RegExp(
  [
    String.raw`(?<!mastercard\s*(?:and|&|,|\/)\s*)\bvisas?\b(?!\s*(?:and|&|,|\/)\s*mastercard|\s+(?:card|cards|debit|credit|network|payments?|direct)\b)`,
    String.raw`\bstamp\s*[0-9][a-z]?\b|\b(?:work|employment)\s+permits?\b|\bwithout\s+(?:a\s+|an\s+|any\s+)?(?:work\s+|employment\s+)?permits?\b`,
    // Not "critical skills such as SQL" or "immigration law": the rest is about the user.
    String.raw`\bcritical\s+skills\b(?!\s+(?:such as|like|in|for|including|of|needed|required|that|which)\b)|\bimmigration\b(?!\s+(?:law|lawyers?|solicitors?|polic(?:y|ies)|research|studies|clinic)\b)`,
    String.raw`\b(?:right|eligible|eligibility|entitled|authori[sz]ed|authori[sz]ation|permitted|permission)\s+to\s+(?:live\s+and\s+)?work\b`,
    String.raw`\b(?:work|working|employment)\s+(?:rights|authori[sz]ation|eligibility)\b|\b(?:legally|lawfully)\s+(?:able|allowed|entitled|permitted)\s+to\s+work\b|\bable\s+to\s+work\s+(?:legally|lawfully)\b`,
    String.raw`\bcitizen(?:ship|s)?\b(?!\s+(?:science|information|advice|journalism|engagement)\b)`,
    String.raw`\b(?:EU|EEA|Irish|UK|British|Swiss|European)\s+(?:nationals?|passports?)\b|\bpassport\s+holder\b|\bhold(?:s|ing)?\s+(?:an?\s+|my\s+)?(?:[\w-]+\s+)?passport\b`,
    String.raw`(?<!\b(?:corporate|event|title|society|club|industry|gold|silver|bronze|commercial|brand|charity|hackathon|conference|sports?|team)\s+)\bsponsorship\b(?!\s+(?:deals?|packages?|revenue|income|funding|agreements?|tiers?)\b)`,
    String.raw`\b(?:need|needs|needing|require|requires|requiring|required|without|no|not|any|seek|seeking|permit|employer|immigration)\s+(?:[\w-]+\s+){0,2}?sponsor(?:ship|ed)?\b`,
    String.raw`\bsponsor(?:ship|ed)?\s+(?:to|for)\s+(?:a\s+|an\s+|my\s+)?(?:work|visa|permit|employment permit|stamp)\b|\bsponsor\s+(?:me|my|international|non-EU|candidates|applicants|visas?|permits?)\b|\b(?:be|been|being|get|getting)\s+sponsored\b`,
  ].join("|"),
  "i",
);
/**
 * Wording that admits a gap. A letter may name a tool it doesn't claim only within about six
 * words of one: "I haven't used Java yet", "Java is new to me". A bare "not", "no" or "never"
 * counts only before the tool ("I used Kafka, not RabbitMQ" doesn't excuse Kafka), and so do
 * plans to learn ("keen to learn Kafka", never "used Kafka and keen to learn more"). "Not only",
 * "no trouble" and "not new to" are boasts, not gaps.
 */
const BOAST = String.raw`(?!\s+(?:only|just|merely|new|unfamiliar|a stranger)\b)`;
const GAP_BEFORE = [
  String.raw`\bnot\b(?!\s+(?:only|just|merely|least|to mention|new|unfamiliar|a stranger)\b)|\bnever\b|\bno\b(?!\s+(?:trouble|problem|doubt|issue|difficulty)s?\b)`,
  String.raw`\b(?:am|['’]m|currently|now|been|started|starting)\s+(?:learn(?:ing)?|pick(?:ing)? up)\b|\b(?:keen|eager|plan(?:ning)?|want|hope|would like|look(?:ing)? forward)\s+to\s+(?:learn(?:ing)?|pick(?:ing)? up)\b`,
].join("|");
const GAP_EITHER = [
  String.raw`\b(?:have|has|had|do|does|did|am|is|are|was|were)\s+(?:not|never)\b${BOAST}|n['’]t\b${BOAST}|\byet to\b|(?<!(?:\bnot|n['’]t)\s)\b(?:new to|unfamiliar)\b|\black(?:s|ing)?\b|\bgap\b(?!\s+analysis)`,
  String.raw`\b(?:limited|less|little|minimal)\s+(?:[\w-]+\s+)?(?:experience|exposure|knowledge)\b`,
].join("|");
const GAP = new RegExp(`(${GAP_EITHER})|${GAP_BEFORE}`, "gi");
const ADMITS_GAP = new RegExp(GAP.source, "i");

/** First-person claims of having done something. In a letter or answer they need a cited fact. */
const CLAIM_DONE =
  /\bI(?:['’]ve| have| had)?\s+(?:also\s+|successfully\s+|previously\s+|recently\s+|already\s+)?(?:built|developed|designed|created|delivered|led|managed|ran|wrote|written|implemented|automated|analy[sz]ed|trained|used|worked|gained|completed|achieved|improved|increased|reduced|handled|launched|organi[sz]ed|presented|mentored|supervised|founded|won|earned|published|deployed|shipped|optimi[sz]ed|coded|programmed|taught|researched)\b/i;
/** Claims of knowing something: "my background in data analysis", "I am an expert in machine learning". */
const CLAIM_KNOWS = new RegExp(
  [
    String.raw`\b(?:my|I have|I['’]ve|I bring|I possess)\s+(?:[\w-]+\s+){0,3}?(?:experience|expertise|background|track record|knowledge|skills?|proficiency|qualifications?)\b`,
    String.raw`\b(?:proficient|skilled|expert|experienced|adept|well[- ]versed|fluent|certified)\s+(?:in|with|at)\b|\bI am (?:an? )?(?:expert|specialist|proficient|skilled|experienced|certified|qualified|fluent)\b`,
  ].join("|"),
  "i",
);
const CLAIM = new RegExp(`${CLAIM_DONE.source}|${CLAIM_KNOWS.source}`, "i");
const CLAIMS_G = [new RegExp(CLAIM_DONE.source, "gi"), new RegExp(CLAIM_KNOWS.source, "gi")];
/** What a knowing claim is about: "background in [data analysis]". */
const CLAIM_TOPIC = /\b(?:experience|expertise|background|knowledge|skills?|proficiency|proficient|skilled|expert|experienced|adept|versed|fluent)\s+(?:in|with|of|at)\s+((?:[\w+#.-]+,?\s*){1,4})/i;
/** "I look forward to discussing how my experience can help": a close, not a claim. */
const CLOSING = /\blook(?:ing)? forward\b|\b(?:discuss|discussing|talk about|explain|share)\s+how\b/i;
/** A paragraph that is only a sign-off: "Kind regards, Aoife Byrne", "Thank you for your time." */
const SIGN_OFF = /^(?:(?:kind|best|warm|many)\s+(?:regards|wishes|thanks)|regards|yours\s+(?:sincerely|faithfully|truly)|sincerely|thank you|thanks|with thanks)\b[^.!?]{0,60}[.!?]?$/i;
const TOPIC_FILLER = new Set("and the this that your their from with into across within using such data-driven".split(" "));

/**
 * Whether an uncited sentence claims more than the profile shows. Having done something always
 * needs a cited fact. Knowing something ("my background in data analysis") may stand when every
 * word of what it's about is in the profile; with no topic it claims nothing in particular.
 */
function claimsUnbacked(text: string, everything: string): boolean {
  // Having done something needs a fact however the sentence ends, unless it's what the close
  // offers to talk about ("I look forward to discussing how I built…").
  const done = CLAIM_DONE.exec(text);
  const close = CLOSING.exec(text);
  if (done) return !(close && close.index < done.index);
  if (!CLAIM_KNOWS.test(text) || ADMITS_GAP.test(text) || close) return false;
  const topic = CLAIM_TOPIC.exec(text)?.[1];
  if (!topic) return false;
  const words = topic.toLowerCase().split(/[\s,]+/).filter((w) => w.length >= 4 && !TOPIC_FILLER.has(w));
  // A shared stem is enough: "analysis" is backed by "analytics".
  return !words.every((w) => everything.includes(w.slice(0, 5)));
}

/**
 * Verbs that change what someone did. Each needs a matching word in the cited facts:
 * "presented dashboards" when the fact says "built dashboards" is an added claim.
 */
const ADDED: { said: RegExp; backed: RegExp }[] = [
  {
    // Not "lead with" (the angle's advice), "a leading provider", "led to faster reporting" or "lead time".
    // Nor "leading companies": an adjective about someone else.
    said: /(?<!\b(?:a|the|industry|market|world)[- ]|['’]s )\b(?:led|lead|leads|leading)\b(?!\s+(?:with|to|time|times|generation|gen|companies|firms|brands|organi[sz]ations|providers|banks|businesses|universities|employers|retailers|experts|edge|global|international|european|irish|tech|technology)\b)|\bspearhead(?:ed|ing)?\b|\bheaded up\b/i,
    // Not someone else's title: "shadowed the team lead", "reported to the head of finance".
    backed:
      /(?<!\b(?:shadow(?:ed|ing)?|assist(?:ed|ing)?|support(?:ed|ing)?|report(?:ed|ing)? to|work(?:ed|ing)? (?:with|for|under)|help(?:ed|ing)?|under|to|for)\s+(?:the\s+|a\s+|an\s+|our\s+|my\s+|their\s+)?(?:[\w-]+\s+)?)\b(?:lead|leads|leader|leaders|head|captain|chair|chairperson|president|founder)\b|\b(?:led|leading|headed|captained|chaired|founded|spearhead(?:ed)?|ran|run|running|organi[sz](?:ed|ing)|coordinat(?:ed|ing))\b/i,
  },
  // "For 5 regional managers" is an audience, not a job: only the user's own title as manager counts.
  {
    said: /\bmanag(?:e|ed|es|ing)\b(?!\s+(?:to|services)\b)/i,
    backed: /\b(?:manag(?:e|ed|es|ing)|ran|run|running)\b|(?<!\b(?:the|a|an|our|their|his|her|my|for|to|with|by|of|\d+)\s+(?:[\w-]+\s+)?)\bmanager\b/i,
  },
  // "Dashboards presenting delivery times" and "presenting findings via dashboards" show data; they don't make a presentation.
  {
    said: /(?<!\b(?:dashboards?|reports?|charts?|visuali[sz]ations?|tables?|graphs?|pages?|views?|screens?|tools?|apps?)\s)\bpresent(?:ed|ing|s|ations?)\b(?!\s+by\b|(?:\s+[\w-]+){1,3}\s+(?:via|through|in|using)\s+(?:[\w-]+\s+){0,3}(?:dashboards?|reports?|charts?|visuali[sz]ations?)\b)/i,
    backed: /\bpresent(?:ed|ing|s|ations?)\b/i,
  },
  { said: /\bmentor(?:ed|ing|s)?\b/i, backed: /\b(?:mentor(?:ed|ing|s)?|coach(?:ed|ing)?|tutor(?:ed|ing)?)\b/i },
  { said: /\bsupervis(?:e|ed|es|ing)\b/i, backed: /\bsupervis(?:e|ed|es|ing|or|ors)\b/i },
  { said: /\boversaw\b|\boversee(?:s|ing)?\b/i, backed: /\b(?:oversaw|oversee(?:s|ing)?|manag(?:e|ed|ing|er)|supervis(?:ed|ing|or))\b/i },
  { said: /\b(?:client|customer)[- ]facing\b/i, backed: /\b(?:clients?|customers?|public)\b/i },
];

const YEARS_CLAIM = /\b(\d{1,2}|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\+?\s*(?:years?|yrs?)['’]?\s*(?:of\s+)?(?:experience|expertise|background)/i;
/** Any script's digits: the text is NFKC-normalised first, so full-width ones read as ASCII. */
const NUMBER_RE = /(?<![\w.])\p{Nd}[\p{Nd},]*(?:\.\p{Nd}+)?/gu;
/** "Doubled", "halved": a result as strong as a number, so the facts have to say it too. */
const CHANGE_RE = /\b(doubl|halv|tripl|quadrupl)(?:ed|ing)\b/gi;
/** "Two hundred staff", "thousands of stores", "tenfold": a scale the facts have to say too. */
const SCALE_RE = /\b(hundred|thousand|million|billion|(?:two|three|four|five|ten|hundred)fold)s?\b/gi;

const UNITS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const NUMBER_WORDS: Record<string, number> = {
  ...UNITS, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, dozen: 12,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
/**
 * "Trained twelve new staff" → "Trained 12 new staff", so spelled-out numbers face the same check as
 * digits. "One" stays a word: "one of", "one-to-one" and "no one" are rarely counts.
 */
export function spellNumbers(s: string): string {
  return s.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](one|two|three|four|five|six|seven|eight|nine))?\b|\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|dozen)\b/gi, (m, tens?: string, unit?: string, small?: string) => {
    if (small) return String(NUMBER_WORDS[small.toLowerCase()]);
    return String(NUMBER_WORDS[tens!.toLowerCase()] + (unit ? (unit.toLowerCase() === "one" ? 1 : UNITS[unit.toLowerCase()]) : 0));
  });
}
/** A posting number a letter may repeat: a calendar year, or the length of the role ("a 6 month placement"). */
const POSTING_DURATION = /^\s*[-–]?\s*(?:month|week|year)s?\b[\s-]*(?:long\s+)?(?:(?:graduate|rotational|paid|work|summer)\s+)?(?:programme|program|placement|internship|contract|rotation|course|scheme|role|position|term|period)\b/i;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\#]/g, "\\$&");
/** Whole-word, any case: "Java" isn't in "JavaScript" and "Rust" isn't in "trust". */
const hasWord = (haystack: string, word: string) => new RegExp(`(?<![\\w+#])${escape(word.trim())}(?![\\w+#])`, "i").test(haystack);

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

/**
 * Small models sometimes cite a fact by quoting it ("Built Power BI dashboards for 5
 * managers") or by its label ("achievement · Harbour Payments") instead of its id.
 * A quote maps to the fact it quotes; a label maps to that kind of fact at that
 * organisation (at most four). Numbers and tools still have to be in those facts.
 */
export function resolveCitations(raw: string[], l: Ledger): string[] {
  const out = new Set<string>();
  for (const r of raw) {
    const id = cleanId(r);
    if (l.byId.has(id)) {
      out.add(id);
      continue;
    }
    const n = norm(r).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    if (n.length < 6) continue;
    const plain = (f: Fact) => norm(f.text).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    const quoted = l.confirmed.filter((f) => {
      const t = plain(f);
      return t.length >= 12 && (n.includes(t) || (n.length >= 20 && t.includes(n)));
    });
    if (quoted.length) {
      for (const f of quoted) out.add(f.id);
      continue;
    }
    const [kind, org] = r.split("·").map((x) => x.trim().toLowerCase());
    if (kind && org) {
      const labelled = l.confirmed.filter((f) => f.kind === kind && f.org && norm(f.org) === norm(org));
      if (labelled.length && labelled.length <= 4) for (const f of labelled) out.add(f.id);
    }
  }
  return [...out];
}
const digits = (s: string) => s.replace(/,/g, "");

export type Ledger = { byId: Map<string, Fact>; confirmed: Fact[]; neverClaim: string[] };

export function ledger(facts: Fact[], neverClaim: string[]): Ledger {
  const confirmed = facts.filter((f) => f.confirmed);
  return { byId: new Map(confirmed.map((f) => [f.id, f])), confirmed, neverClaim: neverClaim.map((n) => n.trim()).filter(Boolean) };
}

function factText(f: Fact): string {
  return [f.text, f.org, f.title, f.start, f.end, f.where].filter(Boolean).join(" · ");
}

/** Every confirmed fact as one lower-case string, for checks that look across the whole profile. Built once per ledger. */
const profileCache = new WeakMap<Ledger, string>();
function profileText(l: Ledger): string {
  let t = profileCache.get(l);
  if (t === undefined) profileCache.set(l, (t = norm(l.confirmed.map(factText).join(" \n "))));
  return t;
}

/** Every confirmed fact's organisation, title and place: the names a CV line may use without citing them. */
const namesCache = new WeakMap<Ledger, string>();
function profileNames(l: Ledger): string {
  let t = namesCache.get(l);
  if (t === undefined) namesCache.set(l, (t = norm(l.confirmed.flatMap((f) => [f.org, f.title, f.where]).filter(Boolean).join(" \n "))));
  return t;
}

const DEGREE_NAME = new RegExp(DEGREE, "i");
/** Whether a sentence names this degree: its own abbreviation ("the MSc") or its university. */
function namesStudy(text: string, f: Fact): boolean {
  const d = DEGREE_NAME.exec(f.text)?.[0];
  if (d && !/^(?:degree|studies|diploma)$/i.test(d) && hasWord(text, d)) return true;
  return Boolean(f.org && norm(text).includes(norm(f.org)));
}

export type WhyNotOptions = {
  requireFacts?: boolean;
  /** CV lines: no first person. Letters and answers are first person. */
  cv?: boolean;
  /** The posting itself: letters may quote its years and durations, and name its tools when admitting a gap. */
  posting?: string;
  /** The CV's objective may quote the posting's numbers too, to name the role as advertised ("Graduate Programme 2027"). */
  quotesPosting?: boolean;
  /** A line that says what's missing (a card's gap line, a gap's fit note): it may name the posting's tools and numbers. */
  gap?: boolean;
  /** Check against every confirmed fact rather than the cited ones, for text that cites nothing (the fit angle). */
  profileWide?: boolean;
  /** Every sentence is about the user even with no "I" or "you" (card lines, fit notes), so led and managed are checked. */
  aboutUser?: boolean;
  now?: Date;
};

type Failure = { rule: GuardRule; token?: string };

const SMALL_WORD = /^(?:and|or|nor|a|an|the|any|of|with|in|on|like|such|as)$/i;
/** The words between two points that count for distance: not small words or the other tools in a list ("C++, Qt or Java"). */
const wordsBetween = (s: string) => s.replace(TOOL_RE, " ").replace(TOOL_SHAPE, " ").split(/[\s,/]+/).filter((w) => w && !SMALL_WORD.test(w));
const JOINS = /[,;:]|\b(?:and|but|or|nor|while|whereas|although|though|yet|so|as|since|because|when|after|before|if|which|that)\b/i;

/**
 * A tool the sentence claims, whatever gap wording sits nearby: "I have used Hadoop",
 * "my Kafka and Databricks experience", "the Snowflake skills I used", "couldn't have
 * done it without Tableau".
 */
function claimsTool(text: string, index: number, length: number): boolean {
  const end = index + length;
  for (const re of CLAIMS_G) {
    for (const m of text.matchAll(re)) {
      const s = m.index ?? 0;
      const e = s + m[0].length;
      // "I have limited experience with Java" claims nothing.
      if (ADMITS_GAP.test(m[0])) continue;
      if (s <= index && end <= e) return true;
      if (e <= index) {
        const between = text.slice(e, index);
        const w = wordsBetween(between);
        // A list of tools straight after the claim, or a few words with no new clause.
        if (!/[.!?]/.test(between) && !ADMITS_GAP.test(between) && (!w.length || (w.length <= 4 && !JOINS.test(between)))) return true;
      } else if (s >= end) {
        const between = text.slice(end, s);
        if (!JOINS.test(between) && !/[.!?]/.test(between) && wordsBetween(between).length <= 3) return true;
      }
    }
  }
  return /\bwithout\s+(?:[\w-]+\s+)?$/i.test(text.slice(0, index)) && /\b(?:not|never|no)\b|n['’]t\b/i.test(text);
}

/** Within about six words of gap wording, not counting the other tools in a list ("C++, Qt or Java"). */
function nearGap(text: string, index: number, length: number): boolean {
  if (claimsTool(text, index, length)) return false;
  for (const g of text.matchAll(GAP)) {
    const gs = g.index ?? 0;
    const ge = gs + g[0].length;
    // Group 1 is wording that admits a gap from either side; the rest only from before the tool.
    if (gs >= index + length && !g[1]) continue;
    const between = ge <= index ? text.slice(ge, index) : gs >= index + length ? text.slice(index + length, gs) : "";
    if (/[.!?](?:\s|$)/.test(between)) continue;
    // Small words don't stretch the distance: "haven't gained experience with tools like Hadoop".
    if (wordsBetween(between).length <= 6) return true;
  }
  return false;
}

/**
 * A tool's name used as a name in the posting, mentioned rather than claimed: the employer
 * ("join MongoDB", "MongoDB is building…", when the posting talks about MongoDB that way) or
 * the role as advertised ("the Workday Analyst role"). "Used MongoDB" is still a claim.
 */
function namesNotClaims(text: string, index: number, length: number, posting: string): boolean {
  const token = escape(text.slice(index, index + length));
  if (!new RegExp(`(?<![\\w+#])${token}(?![\\w+#])`, "i").test(posting)) return false;
  if (/^\s+(?:[A-Z][\w-]*\s+){0,2}(?:role|position|programme|program|internship|team)\b/.test(text.slice(index + length))) return true;
  const named = new RegExp(`\\b(?:at|join|about|why)\\s+${token}\\b|\\b${token}(?:['’]s|\\s+(?:is|are|has|was))\\b`, "i").test(posting);
  const often = (posting.match(new RegExp(`\\b${token}\\b`, "gi"))?.length ?? 0) >= 3;
  const before = text.slice(Math.max(0, index - 40), index);
  // "Interested in MongoDB" is about the employer, not a claim to have used it.
  const used = !/\binterest(?:ed|s)?\s+in\s+$/i.test(before) && /\b(?:used|using|use|uses|with|in|on)\s+$|\b(?:knowledge|experience|skills?|proficien\w*|familiar\w*|expert\w*)\s+(?:in|with|of|on|using)\s+$/i.test(before);
  return named && often && !used;
}

/** Seven words in a row from the posting is copying, not writing. One posting at a time, so one cache entry. */
const SHINGLE = 7;
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9%€£+#]+/g, " ").trim().split(" ").filter(Boolean);
let shingleCache: { posting: string; set: Set<string> } | null = null;
function postingShingles(posting: string): Set<string> {
  if (shingleCache?.posting === posting) return shingleCache.set;
  const w = words(posting);
  const set = new Set<string>();
  for (let i = 0; i + SHINGLE <= w.length; i++) set.add(w.slice(i, i + SHINGLE).join(" "));
  shingleCache = { posting, set };
  return set;
}
function copiesPosting(text: string, posting: string): boolean {
  const set = postingShingles(posting);
  const w = words(text);
  for (let i = 0; i + SHINGLE <= w.length; i++) if (set.has(w.slice(i, i + SHINGLE).join(" "))) return true;
  return false;
}

/** The first thing wrong with a line, and the word that made it wrong (used to repair citations). */
function check(raw: string, rawIds: string[], l: Ledger, opts: WhyNotOptions = {}): Failure | null {
  const { requireFacts = true, cv = true } = opts;
  // Full-width digits and letters read as plain ones.
  const text = raw.normalize("NFKC");
  const rawPosting = opts.posting ?? "";
  const posting = norm(rawPosting);
  const factIds = cleanIds(rawIds);
  const cited = factIds.map((id) => l.byId.get(id)).filter((f): f is Fact => Boolean(f));
  if (factIds.length && cited.length < factIds.length) return { rule: "unknown_fact" };
  if (requireFacts && !cited.length) return { rule: "uncited" };
  const backing = opts.profileWide ? l.confirmed : cited;
  const source = norm(backing.map(factText).join(" \n "));
  const sourceDigits = digits(spellNumbers(source));
  const everything = opts.profileWide ? source : profileText(l);
  const quotes = (!cv || opts.quotesPosting) && Boolean(posting);

  for (const phrase of l.neverClaim) if (phrase.length > 2 && norm(text).includes(norm(phrase))) return { rule: "never_claim" };
  if (WORK_STATUS.test(text)) return { rule: "work_status" };

  // Checked on every sentence, cited or not. A sentence about a degree (citing it, or naming it or
  // its university) can't call it current once it's over; any other can't once every degree is.
  // Studying for a professional exam ("currently studying for the ACCA") is another matter.
  if (!opts.gap && CURRENTLY.test(text) && !IS_CERT.test(text) && !/\b(?:exams?|certification|certificate|qualification)\b/i.test(text)) {
    const study = l.confirmed.filter((f) => f.kind === "education");
    const named = study.filter((f) => cited.includes(f) || namesStudy(text, f));
    const about = named.length ? named : study;
    if (about.length && about.every((f) => isFinished(f, opts.now))) return { rule: "past_as_present" };
  }

  const years = YEARS_CLAIM.exec(text);
  if (years && !source.includes(norm(years[0]))) return { rule: "years_claim" };

  const spelled = spellNumbers(text);
  for (const m of spelled.matchAll(NUMBER_RE)) {
    const n = digits(m[0]);
    // Calendar years are dates, and dates come from the facts' own start/end.
    const year = /^(19|20)\d{2}$/.test(n);
    if (year && source.includes(n)) continue;
    const exact = new RegExp(`(?<![\\d.])${n.replace(".", "\\.")}(?![\\d])`);
    if (exact.test(sourceDigits)) continue;
    // The objective may name the role as advertised ("Software Engineer 2"); letters only its years and durations.
    if ((quotes || opts.gap) && exact.test(digits(spellNumbers(posting)))) {
      if (opts.gap || opts.quotesPosting || year || POSTING_DURATION.test(spelled.slice((m.index ?? 0) + m[0].length))) continue;
    }
    return { rule: "unsupported_number", token: n };
  }
  for (const m of text.matchAll(CHANGE_RE)) if (!new RegExp(`\\b${m[1]}`, "i").test(source)) return { rule: "unsupported_number", token: m[1].toLowerCase() };
  // Letters may say "millions of users" about the employer, as the posting does; not about the user.
  for (const m of text.matchAll(SCALE_RE)) {
    const stem = new RegExp(`\\b${m[1]}`, "i");
    if (stem.test(source) || (!cv && (stem.test(posting) || !/\b(?:I|my|me)\b/i.test(text)))) continue;
    return { rule: "unsupported_number", token: m[1].toLowerCase() };
  }

  for (const m of text.matchAll(CERT_RE)) if (!source.includes(norm(m[0]))) return { rule: "unsupported_cert", token: m[0] };

  const toolSpans: [number, number][] = [];
  for (const m of text.matchAll(TOOL_RE)) {
    const at = m.index ?? 0;
    toolSpans.push([at, at + m[0].length]);
    if (WORD_TOOLS.has(m[0].toLowerCase()) && m[0][0] !== m[0][0].toUpperCase()) continue;
    if (hasWord(source, m[0])) continue;
    // A letter may name a tool it doesn't claim: near words that admit the gap, or as the employer's name.
    if (!cv && nearGap(text, at, m[0].length)) continue;
    if (opts.gap && hasWord(posting, m[0])) continue;
    if (quotes && namesNotClaims(text, at, m[0].length, posting)) continue;
    return { rule: "unsupported_tool", token: m[0] };
  }
  for (const m of text.matchAll(TOOL_SHAPE)) {
    const at = m.index ?? 0;
    if (toolSpans.some(([s, e]) => at < e && at + m[0].length > s) || NOT_A_TOOL.test(m[0])) continue;
    // On a CV the cited facts have to name it, or it's a name in the profile (an employer, a society).
    if (cv ? hasWord(source, m[0]) || hasWord(profileNames(l), m[0]) : hasWord(everything, m[0])) continue;
    // The posting's own names (the employer, its products) may be mentioned, just not claimed.
    if ((quotes || opts.gap) && hasWord(posting, m[0]) && (opts.gap || !CLAIM.test(text) || namesNotClaims(text, at, m[0].length, posting))) continue;
    if (!cv && nearGap(text, at, m[0].length)) continue;
    return { rule: "unsupported_tool", token: m[0] };
  }

  // Letters and answers: a sentence that claims something needs a fact behind it, however it's worded.
  if (!requireFacts && !cited.length && !opts.profileWide && !opts.gap && claimsUnbacked(text, everything)) return { rule: "uncited" };

  // Led, managed, presented: the facts have to say so, in their own words. In a letter only
  // sentences about the user count; "Arup leads major projects" is about Arup.
  const aboutUser = cv || opts.aboutUser || /\b(?:I|[Mm]y|[Mm]e|[Yy]ou|[Yy]our)\b/.test(text);
  if (backing.length && aboutUser && !opts.gap) {
    const said = norm(backing.map((f) => [f.text, f.title].filter(Boolean).join(" ")).join(" \n "));
    for (const a of ADDED) {
      const m = a.said.exec(text);
      if (!m || a.backed.test(said)) continue;
      return { rule: "added_claim", token: m[0].toLowerCase() };
    }
  }
  if (!cv && posting && !opts.gap && copiesPosting(text, rawPosting)) return { rule: "posting_copy" };
  if (cv && FIRST_PERSON.test(text)) return { rule: "first_person" };
  return null;
}

/** Why a cited line can't stay, or null when it can. */
export function whyNot(text: string, rawIds: string[], l: Ledger, opts: WhyNotOptions = {}): GuardRule | null {
  return check(text, rawIds, l, opts)?.rule ?? null;
}

/** Where a line sits outside the CV: a card's "why" line, a fit note, or the fit's angle. */
export type LineKind = "strong" | "transferable" | "gap" | "note" | "angle";

/**
 * The guard for card lines, fit notes and the fit angle, which aren't CV lines but still
 * can't invent. Same rules as a CV line, minus first person:
 *   - strong, transferable, note: must cite facts, and everything said must be in them
 *   - gap: says what's missing, so it may name the posting's tools and numbers (pass `posting`)
 *   - angle: cites nothing, so it's checked against every confirmed fact
 * Status and never-claim rules apply to all of them. Returns the rule broken, or null.
 */
export function whyNotLine(text: string, ids: string[], l: Ledger, kind: LineKind, posting = "", now?: Date): GuardRule | null {
  const clean = houseStyle(stripCitations(text, l));
  const raw = [...ids, ...inlineIds(text), ...bareIds(text, l)];
  const known = resolveCitations(raw, l);
  const cited = known.length ? known : raw;
  // A gap line claims nothing, so its numbers and names may come from anywhere in the profile or the posting.
  if (kind === "gap") return whyNot(clean, cited, l, { requireFacts: false, cv: false, gap: true, profileWide: true, posting, now });
  if (kind === "angle") return whyNot(clean, cited, l, { requireFacts: false, cv: false, profileWide: true, aboutUser: true, now });
  return whyNot(clean, cited, l, { cv: false, aboutUser: true, now });
}

/** "…from 41% to 68% [ab7]." → "…from 41% to 68%." The ids live in `facts`, not the prose. */
/** Removes [ab5] and (ab5, ab6) citations, [posting]-style source tags, and with a ledger also bare ids ("… dashboards rm5, rm11"). */
export const stripCitations = (s: string, l?: Ledger) => {
  const out = s
    .replace(/\s*\[(?:\s*[a-z]{1,3}\d[\w-]*\s*,?)+\]/gi, "")
    .replace(/\s*\((?:\s*[a-z]{1,3}\d[\w-]*\s*,?)+\)/gi, "")
    .replace(/\s*[[(](?:the\s+)?(?:job\s+)?(?:posting|job ad|advert|description|facts?|sources?)[\])]/gi, "");
  return l ? stripBareIds(out, l) : out;
};

/** Fact ids a model wrote inline, in [ab5] or (ab5, ab6) form. */
export const inlineIds = (s: string) => [...s.matchAll(/[[(]((?:\s*[a-z]{1,3}\d[\w-]*\s*,?)+)[\])]/gi)].flatMap((m) => m[1].split(/[,\s]+/)).filter(Boolean);

const BARE_ID = /\b[a-z][a-z0-9]{0,10}\d\b/gi;

/** Fact ids a model wrote with no brackets. Only real ids count, so "Q3" or "B2" are left alone. */
export const bareIds = (s: string, l: Ledger) => [...s.matchAll(BARE_ID)].map((m) => m[0].toLowerCase()).filter((id) => l.byId.has(id));

function stripBareIds(s: string, l: Ledger): string {
  const marked = s.replace(BARE_ID, (t) => (l.byId.has(t.toLowerCase()) ? "\u0000" : t));
  if (marked === s) return s;
  return marked
    .replace(/(?:\s*(?:,|\band\b)?\s*\u0000)+/g, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

/** "One. Two? Three." → ["One.", "Two?", "Three."], without splitting "e.g." or "3.5". */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"“(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "However, …" contrasts with the sentence before; once that sentence is gone, so is the "However". */
function dropConnective(s: string): string {
  const out = s.replace(/^(?:However|But|Nevertheless|Nonetheless|That said|Still|Even so|Despite this|Instead|Yet),?\s+/i, "");
  return out === s ? s : out[0].toUpperCase() + out.slice(1);
}

/**
 * Failures another fact from the same employer can fix: the model cited one fact and used the
 * next one's numbers or tools. Never led, managed and the like: a verb that changes what someone
 * did isn't fixed by borrowing a fact.
 */
const REPAIRABLE = new Set<GuardRule>(["unsupported_number", "unsupported_tool", "unsupported_cert"]);

type Guarded = { text: string | null; facts: string[]; droppedLast: boolean };

/**
 * Guard sentence by sentence: one invented claim costs that sentence, not the whole
 * paragraph. Citation and fact checks use the item's cited facts. When a sentence fails
 * on a number, tool or verb that another fact from the same employer states, that fact is
 * added to the citations (a `cite_repaired` repair) instead of dropping a true sentence.
 */
function guardText(text: string, facts: string[], l: Ledger, events: GuardEvent[], opts: WhyNotOptions = {}, repairs?: GuardRepair[], employer?: string): Guarded {
  const clean = houseStyle(stripCitations(text, l));
  // Ids that don't exist are ignored; what's left has to back the line on its own.
  const ids = cleanIds(facts);
  const known = resolveCitations(facts, l);
  if ((opts.requireFacts ?? true) && !known.length) {
    events.push({ rule: ids.length ? "unknown_fact" : "uncited", text, ...(ids.length ? { ids: facts.slice(0, 4) } : {}) });
    return { text: null, facts: [], droppedLast: true };
  }
  const cites = [...known];
  const kept: string[] = [];
  let droppedLast = false;
  for (const sentence of splitSentences(clean)) {
    let fail = check(sentence, cites, l, opts);
    const extra = fail && REPAIRABLE.has(fail.rule) ? repair(sentence, cites, l, opts, employer) : [];
    if (extra.length) fail = null;
    if (fail) {
      events.push({ rule: fail.rule, text: sentence });
      droppedLast = true;
      continue;
    }
    if (extra.length) {
      repairs?.push({ rule: "cite_repaired", text: sentence, ids: extra });
      cites.push(...extra);
    }
    kept.push(droppedLast ? dropConnective(sentence) : sentence);
    droppedLast = false;
  }
  return { text: kept.length ? kept.join(" ") : null, facts: cites, droppedLast };
}

/**
 * One more fact that makes the line pass on its own, or none. It comes from the employer a bullet
 * is filed under, or from the employers the line already cites. One fact has to back everything:
 * a number from one fact and a tool from another would build a claim neither makes.
 */
function repair(sentence: string, cites: string[], l: Ledger, opts: WhyNotOptions, employer?: string): string[] {
  const orgs = new Set((employer ? [employer] : cites.map((id) => l.byId.get(id)?.org)).filter((o): o is string => Boolean(o)).map(companyKey));
  if (!orgs.size) return [];
  const helper = l.confirmed.find((f) => f.org && orgs.has(companyKey(f.org)) && !cites.includes(f.id) && !check(sentence, [...cites, f.id], l, opts));
  return helper ? [helper.id] : [];
}

/** The sentence-by-sentence guard on its own: the kept text, or null when nothing survives. */
export function keepSentences(text: string, facts: string[], l: Ledger, events: GuardEvent[], opts?: WhyNotOptions, repairs?: GuardRepair[]): string | null {
  return guardText(text, facts, l, events, opts, repairs).text;
}

/** The ids a line cites: its list, plus any the model wrote into the text ("… Galway (rm1)."). */
const citesOf = (item: { text: string; facts: string[] }, l: Ledger) => [...item.facts, ...inlineIds(item.text), ...bareIds(item.text, l)];

function keep<T extends Cited>(items: T[], l: Ledger, events: GuardEvent[], opts: WhyNotOptions | ((i: number) => WhyNotOptions) = {}, repairs?: GuardRepair[], employer?: string): T[] {
  const out: T[] = [];
  let droppedBefore = false;
  items.forEach((item, i) => {
    const facts = citesOf(item, l);
    const g = guardText(item.text, facts, l, events, typeof opts === "function" ? opts(i) : opts, repairs, employer);
    // A paragraph that opened "However," after the last one went is a dangling contrast too.
    if (g.text) out.push({ ...item, text: droppedBefore ? dropConnective(g.text) : g.text, facts: resolveCitations(g.facts, l) });
    droppedBefore = !g.text || g.droppedLast;
  });
  return out;
}

const sameOrg = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && companyKey(a) === companyKey(b));

const SKILL_FILLER = /^(?:and|or|of|the|in|with|for|to|a|an|&)$/i;

/** `posting` lets the objective name the role as advertised; every other CV line keeps to the facts. `repairs` lists citations the guard added. */
export function guardCv(body: CvBody, l: Ledger, posting = "", now?: Date): { body: CvBody; events: GuardEvent[]; repairs: GuardRepair[] } {
  const events: GuardEvent[] = [];
  const repairs: GuardRepair[] = [];
  const roleOrgs = [...new Set(l.confirmed.filter((f) => f.kind === "role" && f.org).map((f) => f.org as string))];

  const roles = body.roles
    .map((r) => {
      const org = roleOrgs.find((o) => sameOrg(o, r.org));
      if (!org) {
        for (const b of r.bullets) events.push({ rule: "wrong_employer", text: b.text });
        return null;
      }
      const bullets = keep(r.bullets, l, events, { now }, repairs, org).filter((b) => {
        const foreign = b.facts
          .map((id) => l.byId.get(id))
          .find((f) => f?.org && !sameOrg(f.org, org));
        if (foreign) events.push({ rule: "wrong_employer", text: b.text });
        return !foreign;
      });
      return { org, bullets };
    })
    .filter((r): r is { org: string; bullets: Cited[] } => Boolean(r));

  const competencies = body.competencies
    .map((c) => ({ ...c, text: houseStyle(stripCitations(c.text, l)), label: houseStyle(c.label), facts: resolveCitations(citesOf(c, l), l) }))
    .filter((c) => {
      const rule = whyNot(`${c.label}: ${c.text}`, c.facts, l, { now });
      if (rule) events.push({ rule, text: `${c.label}: ${c.text}` });
      return !rule;
    });

  // A skill stays when the profile names it: as a whole phrase, or every word of it as a whole word.
  // Tools and certifications inside it have to appear as written ("Power BI", not "power" and "BI").
  const everything = profileText(l);
  const skills = [...new Set(body.skills.map((s) => houseStyle(stripCitations(s, l)).trim()).filter(Boolean))].filter((s) => {
    const named = hasWord(everything, norm(s)) || norm(s).split(/[\s/,&()]+/).every((w) => !w || SKILL_FILLER.test(w) || hasWord(everything, w));
    const ok = named && [...s.matchAll(TOOL_RE)].every((m) => hasWord(everything, m[0])) && [...s.matchAll(CERT_RE)].every((m) => everything.includes(norm(m[0])));
    if (!ok) events.push({ rule: "unsupported_skill", text: s });
    return ok && !IS_CERT.test(s);
  });

  return {
    body: {
      objective: keep(body.objective ?? [], l, events, { posting, quotesPosting: true, now }, repairs),
      summary: keep(body.summary, l, events, { now }, repairs),
      competencies,
      roles,
      projects: keep(body.projects, l, events, { now }, repairs),
      achievements: keep(body.achievements, l, events, { now }, repairs),
      skills: skills.slice(0, 30),
    },
    events,
    repairs,
  };
}

/**
 * Cover letters are first person. Only the opening and closing paragraphs may cite nothing,
 * and even there a sentence that claims something needs a fact. Nothing can invent.
 */
export function guardLetter(letter: Letter, l: Ledger, posting = "", now?: Date): { letter: Letter; events: GuardEvent[]; repairs: GuardRepair[] } {
  const events: GuardEvent[] = [];
  const repairs: GuardRepair[] = [];
  // A sign-off after the close ("Kind regards, Aoife") isn't the close: the paragraph before it still is.
  let last = letter.paragraphs.length - 1;
  while (last > 0 && splitSentences(letter.paragraphs[last].text).every((s) => SIGN_OFF.test(s))) last--;
  const paragraphs = keep(letter.paragraphs, l, events, (i) => ({ requireFacts: !(i === 0 || i >= last), cv: false, posting, now }), repairs);
  return { letter: { paragraphs }, events, repairs };
}

/** Answers are first person too: uncited sentences may talk about the employer, not about what the user has done. */
export function guardAnswers(a: Answers, l: Ledger, posting = "", now?: Date): { answers: Answers; events: GuardEvent[]; repairs: GuardRepair[] } {
  const events: GuardEvent[] = [];
  const repairs: GuardRepair[] = [];
  const answers = a.answers.map((x) => {
    if (x.needsYou) return { ...x, answer: "", facts: [] };
    const g = guardText(x.answer, x.facts, l, events, { requireFacts: false, cv: false, posting, now }, repairs);
    if (!g.text) return { ...x, answer: "", facts: [], needsYou: true };
    return { ...x, answer: g.text, facts: resolveCitations(g.facts, l) };
  });
  return { answers: { answers }, events, repairs };
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
    const facts = resolveCitations(r.facts, l);
    if (r.match !== "gap" && !facts.length) {
      events.push({ rule: "fit_demoted", text: r.need });
      return { ...r, match: "gap" as const, facts: [], note: r.note };
    }
    return { ...r, facts, need: clip(houseStyle(stripCitations(r.need, l)), 200), note: clip(houseStyle(stripCitations(r.note, l)), 320) };
  });
  return { fit: { ...fit, requirements, angle: clip(houseStyle(stripCitations(fit.angle, l)), 300) }, events };
}
