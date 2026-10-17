// Role families. The user picks a few in the check-in; each maps to one Google Jobs
// search for all of Ireland (up to two pages), shared by every user and cached for a
// week, so the feed costs the same for one user or a thousand. Title keywords sort the
// ATS boards and every search's results on the device.

/** also: extra words the check-in's search matches, so "bookkeeping" or "nursing" finds its field. */
export type Category = { id: string; label: string; query: string; titles: RegExp; also?: string };

export const CATEGORIES: Category[] = [
  { id: "software", label: "Software engineering", query: "graduate software engineer", titles: /\b(software|developer|engineer(ing)?,? (front|back|full)|full[- ]stack|frontend|backend|mobile|android|ios|devops|site reliability|sre|platform engineer)\b/i, also: "programming coding web app" },
  { id: "data", label: "Data and analytics", query: "graduate data analyst", titles: /\b(data|analytics|analyst|business intelligence|bi developer|machine learning|ml engineer|ai engineer|scientist)\b/i, also: "statistics reporting ai" },
  { id: "cyber", label: "Cyber security", query: "graduate cyber security analyst", titles: /\b(security|cyber|soc|grc|risk|compliance|privacy|threat|incident)\b/i },
  { id: "it", label: "IT and support", query: "graduate IT support analyst", titles: /\b(it support|service desk|technical support|support engineer|systems administrator|network|infrastructure|helpdesk)\b/i, also: "technology tech" },
  { id: "accounting", label: "Accounting and audit", query: "trainee accountant", titles: /\b(accountant|accounting|accounts (payable|receivable|assistant|executive)|audit(or|ing)?|bookkeep(er|ing)|book-keep(er|ing)|payroll|financial reporting|aca|acca|cima)\b/i, also: "chartered bookkeeping ledger" },
  { id: "tax", label: "Tax", query: "tax trainee", titles: /\b(tax|taxation|vat|transfer pricing|customs)\b/i, also: "revenue" },
  { id: "finance", label: "Finance and banking", query: "graduate finance analyst", titles: /\b(finance|financial|fp&a|treasury|bank(ing)?|credit|fund|investment|asset management|wealth|capital markets|trading|trader)\b/i, also: "money markets" },
  { id: "insurance", label: "Insurance and actuarial", query: "graduate insurance underwriter", titles: /\b(insurance|underwrit(er|ing)|claims|actuar(y|ial)|reinsurance|broker)\b/i },
  { id: "management", label: "Management and leadership", query: "management trainee", titles: /\b(manager|management|team lead(er)?|supervisor|head of|director|general manager)\b/i, also: "leader lead team" },
  { id: "operations", label: "Operations and supply chain", query: "graduate operations supply chain analyst", titles: /\b(operations|supply chain|logistics|procurement|purchasing|planning|planner)\b/i, also: "warehouse buyer" },
  { id: "consulting", label: "Consulting and project management", query: "graduate consultant programme", titles: /\b(consultant|consulting|advisory|project (manager|coordinator|analyst)|programme|pmo|business analyst)\b/i },
  { id: "admin", label: "Administration and office", query: "administrator", titles: /\b(administrator|administrative|admin|office (manager|coordinator|assistant)|receptionist|secretary|executive assistant|personal assistant)\b/i, also: "clerical" },
  { id: "sales", label: "Sales and business development", query: "graduate business development representative", titles: /\b(sales|business development|bdr|sdr|account executive|account manager|partnerships)\b/i },
  { id: "customer", label: "Customer success and support", query: "graduate customer success associate", titles: /\b(customer (success|support|experience|service)|client (success|services)|onboarding|support specialist)\b/i },
  { id: "marketing", label: "Marketing and communications", query: "graduate marketing executive", titles: /\b(marketing|communications|content|brand|social media|seo|growth|pr|campaigns?)\b/i, also: "advertising media" },
  { id: "product", label: "Product and design", query: "associate product manager graduate", titles: /\b(product (manager|owner|analyst|designer)|ux|ui|designer|design)\b/i },
  { id: "people", label: "HR and recruitment", query: "graduate HR recruitment coordinator", titles: /\b(hr|human resources|people (ops|operations|partner)|recruit(er|ment|ing)|talent acquisition)\b/i, also: "talent" },
  { id: "legal", label: "Legal and policy", query: "trainee legal policy graduate", titles: /\b(legal|paralegal|solicitor|policy|public affairs|counsel)\b/i, also: "law lawyer" },
  { id: "public", label: "Public sector", query: "graduate civil service", titles: /\b(civil service|public service|executive officer|clerical officer|administrative officer|county council|city council|government)\b/i, also: "state council" },
  { id: "engineering", label: "Engineering (non-software)", query: "graduate engineer mechanical electrical", titles: /\b(mechanical|electrical|civil|manufacturing|process|quality|validation|automation|chemical|biomedical) engineer/i },
  { id: "construction", label: "Construction and property", query: "graduate quantity surveyor", titles: /\b(quantity surveyor|surveyor|construction|site (engineer|manager)|estimator|property|real estate|facilities)\b/i, also: "building" },
  { id: "science", label: "Science and pharma", query: "graduate scientist pharma", titles: /\b(scientist|laboratory|lab |chemist|biolog|qc analyst|regulatory affairs|clinical)\b/i, also: "research" },
  { id: "health", label: "Healthcare and social care", query: "healthcare graduate", titles: /\b(nurse|nursing|healthcare|health care|care assistant|carer|social care|social worker|pharmacist|physiotherapist|therapist|radiographer)\b/i, also: "hospital medical care" },
  { id: "education", label: "Education and training", query: "graduate teacher", titles: /\b(teacher|teaching|tutor|lecturer|trainer|education|learning (and|&) development)\b/i, also: "school" },
  { id: "retail", label: "Retail and hospitality", query: "retail management graduate", titles: /\b(retail|store|shop|hospitality|hotel|restaurant|chef|front of house|merchandis(er|ing))\b/i, also: "food tourism" },
];

/** One Google Jobs search: a query, a SerpApi location and how many pages of ~10 to read. */
export type Search = { id: string; query: string; location: string; pages: number };

/** A role family's own search: its query for all of Ireland, two pages. */
export const familySearch = (c: Category): Search => ({ id: c.id, query: c.query, location: "Ireland", pages: 2 });

/**
 * Early-career searches for every user, whatever they picked: the deck sorts them by role
 * and city on the device. Measured 16 Oct: "graduate" across Ireland gave ~8.5 Irish
 * early-career jobs a page for at least 6 pages (51 of 51 early), where a family query like
 * "graduate data analyst" ran out after 8. City searches find jobs the Ireland-wide one
 * doesn't (5 of 19 overlapped for Dublin). 18 pages a refresh, about once a week.
 */
export const POOL: Search[] = [
  { id: "graduate", query: "graduate", location: "Ireland", pages: 8 },
  { id: "graduate-dublin", query: "graduate", location: "Dublin,County Dublin,Ireland", pages: 1 },
  { id: "programme-dublin", query: "graduate programme", location: "Dublin,County Dublin,Ireland", pages: 2 },
  { id: "graduate-cork", query: "graduate", location: "Cork,County Cork,Ireland", pages: 1 },
  { id: "graduate-galway", query: "graduate", location: "Galway,County Galway,Ireland", pages: 1 },
  { id: "graduate-limerick", query: "graduate", location: "Limerick,County Limerick,Ireland", pages: 1 },
  { id: "junior", query: "junior", location: "Ireland", pages: 2 },
  { id: "trainee", query: "trainee", location: "Ireland", pages: 1 },
  { id: "internship", query: "internship", location: "Ireland", pages: 1 },
];

export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id);

/**
 * The fields a check-in search finds: a word in the label or extra words, or a job title the
 * field would sort into ("auditor" finds Accounting and audit).
 */
export function searchCategories(query: string): Category[] {
  const q = query.trim().toLowerCase();
  if (!q) return CATEGORIES;
  return CATEGORIES.filter((c) => `${c.label} ${c.also ?? ""}`.toLowerCase().includes(q) || c.titles.test(q));
}

export function categoriesForTitle(title: string): string[] {
  return CATEGORIES.filter((c) => c.titles.test(title)).map((c) => c.id);
}
