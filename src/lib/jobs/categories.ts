// Role families. The user picks a few in the check-in; each maps to one Google Jobs
// search for all of Ireland (up to two pages), shared by every user and cached for a
// week, so the feed costs the same for one user or a thousand. Title keywords sort the
// ATS boards and every search's results on the device.

export type Category = { id: string; label: string; query: string; titles: RegExp };

export const CATEGORIES: Category[] = [
  { id: "software", label: "Software engineering", query: "graduate software engineer", titles: /\b(software|developer|engineer(ing)?,? (front|back|full)|full[- ]stack|frontend|backend|mobile|android|ios|devops|site reliability|sre|platform engineer)\b/i },
  { id: "data", label: "Data and analytics", query: "graduate data analyst", titles: /\b(data|analytics|analyst|business intelligence|bi developer|machine learning|ml engineer|ai engineer|scientist)\b/i },
  { id: "cyber", label: "Cyber security", query: "graduate cyber security analyst", titles: /\b(security|cyber|soc|grc|risk|compliance|privacy|threat|incident)\b/i },
  { id: "it", label: "IT and support", query: "graduate IT support analyst", titles: /\b(it support|service desk|technical support|support engineer|systems administrator|network|infrastructure|helpdesk)\b/i },
  { id: "finance", label: "Finance and accounting", query: "graduate finance accountant trainee", titles: /\b(finance|financial|accountant|accounting|audit|tax|treasury|payroll|credit|fund|investment)\b/i },
  { id: "sales", label: "Sales and business development", query: "graduate business development representative", titles: /\b(sales|business development|bdr|sdr|account executive|account manager|partnerships)\b/i },
  { id: "customer", label: "Customer success and support", query: "graduate customer success associate", titles: /\b(customer (success|support|experience|service)|client (success|services)|onboarding|support specialist)\b/i },
  { id: "marketing", label: "Marketing and communications", query: "graduate marketing executive", titles: /\b(marketing|communications|content|brand|social media|seo|growth|pr|campaigns?)\b/i },
  { id: "product", label: "Product and design", query: "associate product manager graduate", titles: /\b(product (manager|owner|analyst|designer)|ux|ui|designer|design)\b/i },
  { id: "people", label: "HR and recruitment", query: "graduate HR recruitment coordinator", titles: /\b(hr|human resources|people (ops|operations|partner)|recruit(er|ment|ing)|talent acquisition)\b/i },
  { id: "operations", label: "Operations and supply chain", query: "graduate operations supply chain analyst", titles: /\b(operations|supply chain|logistics|procurement|purchasing|planning|planner)\b/i },
  { id: "consulting", label: "Consulting and project management", query: "graduate consultant programme", titles: /\b(consultant|consulting|advisory|project (manager|coordinator|analyst)|programme|pmo|business analyst)\b/i },
  { id: "engineering", label: "Engineering (non-software)", query: "graduate engineer mechanical electrical", titles: /\b(mechanical|electrical|civil|manufacturing|process|quality|validation|automation|chemical|biomedical) engineer/i },
  { id: "science", label: "Science and pharma", query: "graduate scientist pharma", titles: /\b(scientist|laboratory|lab |chemist|biolog|qc analyst|regulatory affairs|clinical)\b/i },
  { id: "legal", label: "Legal and policy", query: "trainee legal policy graduate", titles: /\b(legal|paralegal|solicitor|policy|public affairs|counsel)\b/i },
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

export function categoriesForTitle(title: string): string[] {
  return CATEGORIES.filter((c) => c.titles.test(title)).map((c) => c.id);
}
