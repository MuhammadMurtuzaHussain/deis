import { sanitisePosting } from "./sanitize";
import type { Job, ScoredJob } from "./types";
import { classifySeniority } from "./seniority";
import { readRightToWork } from "./rightToWork";
import { requiredLanguages } from "./languages";

// Every source becomes the same Job, then the same ScoredJob. Republic of Ireland
// only for now: Belfast is in the UK, where the right-to-work rules differ.

export const CITIES = [
  "Dublin",
  "Cork",
  "Galway",
  "Limerick",
  "Waterford",
  "Athlone",
  "Kilkenny",
  "Sligo",
  "Letterkenny",
  "Dundalk",
  "Drogheda",
  "Shannon",
  "Ennis",
  "Carlow",
  "Wexford",
  "Tralee",
] as const;

const CITY_RE = new RegExp(`\\b(${CITIES.join("|")})\\b`, "i");
const IRELAND_RE = /\b(ireland|éire|eire|republic of ireland|\bIE\b)\b/i;
const REMOTE_RE = /\b(remote|work from home|wfh|anywhere)\b/i;
const UK_ONLY_RE = /\b(belfast|northern ireland|derry|london(?!derry)|united kingdom|\buk\b)\b/i;

/** "Dublin", "Remote (Ireland)", "Ireland", or null when the location isn't in the Republic. */
export function irishCity(location: string): { city: string; remote: boolean } | null {
  const remote = REMOTE_RE.test(location);
  const city = CITY_RE.exec(location)?.[1];
  if (city) return { city: city[0].toUpperCase() + city.slice(1).toLowerCase(), remote };
  if (IRELAND_RE.test(location) && !/northern ireland/i.test(location)) return { city: remote ? "Remote (Ireland)" : "Ireland", remote };
  if (UK_ONLY_RE.test(location)) return null;
  return null;
}

const LEGAL_SUFFIX = /\b(limited|ltd|inc|incorporated|llc|plc|dac|gmbh|ag|sa|bv|group|holdings|ireland|international|technologies|technology|the)\b\.?/gi;

export function companyKey(name: string): string {
  return name.toLowerCase().replace(LEGAL_SUFFIX, "").replace(/[^a-z0-9]+/g, "");
}

function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** FNV-1a, base 36: short, stable ids without a crypto import in the browser. */
export function hashId(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function jobId(company: string, title: string, city: string): string {
  return hashId(`${companyKey(company)}|${titleKey(title)}|${city.toLowerCase()}`);
}

/** "3 days ago" → ISO date, relative to `now`. */
export function parseRelativeDate(s: string | undefined, now = new Date()): string | null {
  if (!s) return null;
  const m = /(\d+)\+?\s*(minute|hour|day|week|month)s?\s+ago/i.exec(s);
  if (!m) return /just posted|today/i.test(s) ? now.toISOString() : null;
  const n = Number(m[1]);
  const ms = { minute: 6e4, hour: 3.6e6, day: 8.64e7, week: 6.048e8, month: 2.592e9 }[m[2].toLowerCase() as "day"];
  return new Date(now.getTime() - n * ms).toISOString();
}

// ---- Greenhouse: boards-api.greenhouse.io/v1/boards/<slug>/jobs?content=true

export type GreenhouseJob = {
  id: number;
  title: string;
  updated_at?: string;
  first_published?: string;
  location?: { name?: string };
  absolute_url: string;
  content?: string;
};

export function fromGreenhouse(raw: GreenhouseJob, company: string): ScoredJob | null {
  const place = irishCity(raw.location?.name ?? "");
  if (!place || NOT_A_JOB.test(raw.title)) return null;
  const { text, injections } = sanitisePosting(raw.content ?? "");
  return score(
    {
      id: jobId(company, raw.title, place.city),
      source: "greenhouse",
      title: raw.title.trim(),
      company,
      location: raw.location?.name ?? place.city,
      city: place.city,
      remote: place.remote,
      postedAt: raw.first_published ?? raw.updated_at ?? null,
      description: text,
      salary: null,
      apply: [{ label: company, url: raw.absolute_url }],
      url: raw.absolute_url,
    },
    injections,
  );
}

// ---- Ashby: api.ashbyhq.com/posting-api/job-board/<slug>?includeCompensation=true

export type AshbyJob = {
  title: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  isRemote?: boolean;
  descriptionHtml?: string;
  descriptionPlain?: string;
  publishedAt?: string;
  jobUrl: string;
  applyUrl?: string;
  compensation?: { compensationTierSummary?: string | null } | null;
};

export function fromAshby(raw: AshbyJob, company: string): ScoredJob | null {
  const locations = [raw.location ?? "", ...(raw.secondaryLocations ?? []).map((l) => l.location ?? "")];
  const place = locations.map(irishCity).find(Boolean);
  if (!place || NOT_A_JOB.test(raw.title)) return null;
  const { text, injections } = sanitisePosting(raw.descriptionHtml ?? raw.descriptionPlain ?? "");
  return score(
    {
      id: jobId(company, raw.title, place.city),
      source: "ashby",
      title: raw.title.trim(),
      company,
      location: locations.filter(Boolean).join(" · "),
      city: place.city,
      remote: place.remote || Boolean(raw.isRemote),
      postedAt: raw.publishedAt ?? null,
      description: text,
      salary: raw.compensation?.compensationTierSummary ?? null,
      apply: [{ label: company, url: raw.applyUrl ?? raw.jobUrl }],
      url: raw.jobUrl,
    },
    injections,
  );
}

// ---- Google Jobs via SerpApi: engine=google_jobs, location only (gl=ie is rejected)

export type GoogleJob = {
  title: string;
  company_name: string;
  location?: string;
  via?: string;
  description?: string;
  job_highlights?: { title?: string; items?: string[] }[];
  detected_extensions?: { posted_at?: string; salary?: string; work_from_home?: boolean };
  apply_options?: { title: string; link: string }[];
  share_link?: string;
};

/** Aggregators that resell other boards' listings; the employer's own page goes first. */
const AGGREGATOR = /bebee|jooble|jobrapido|jobijoba|trabajo|expertini|jobleads|jobnova|ziprecruiter|talent\.com|whatjobs|adzuna|glassdoor|startup jobs/i;

export function fromGoogleJobs(raw: GoogleJob, now = new Date()): ScoredJob | null {
  const place = irishCity(raw.location ?? "");
  if (!place || NOT_A_JOB.test(raw.title)) return null;
  const highlights = (raw.job_highlights ?? [])
    .map((h) => [h.title, ...(h.items ?? []).map((i) => `• ${i}`)].filter(Boolean).join("\n"))
    .join("\n\n");
  const { text, injections } = sanitisePosting([raw.description ?? "", highlights].filter(Boolean).join("\n\n"));
  const apply = (raw.apply_options ?? [])
    .filter((a) => /^https?:\/\//.test(a.link))
    .sort((a, b) => Number(AGGREGATOR.test(a.title)) - Number(AGGREGATOR.test(b.title)))
    .map((a) => ({ label: a.title, url: a.link }));
  const url = apply[0]?.url ?? raw.share_link;
  if (!url) return null;
  return score(
    {
      id: jobId(raw.company_name, raw.title, place.city),
      source: "google_jobs",
      title: raw.title.trim(),
      company: raw.company_name.trim(),
      location: raw.location ?? place.city,
      city: place.city,
      remote: place.remote || Boolean(raw.detected_extensions?.work_from_home),
      postedAt: parseRelativeDate(raw.detected_extensions?.posted_at, now),
      description: text,
      salary: raw.detected_extensions?.salary ?? null,
      apply,
      url,
    },
    injections,
  );
}

// ---- Scoring and merging

/** Pasted postings come through here too, with the injections sanitisePosting found. */
/** Talent pools and open applications aren't jobs you can swipe on. */
export const NOT_A_JOB = /\b(talent (community|pool|network)|general application|speculative application|expression of interest|open application|future opportunities)\b/i;

export function score(job: Job, injections: string[]): ScoredJob {
  return {
    languages: requiredLanguages(job.title, job.description),
    ...job,
    seniority: classifySeniority(job.title, job.description),
    rightToWork: readRightToWork(job.description),
    injections,
  };
}

/** Same role from two places: keep the one with the longer description, pool the apply links. */
export function mergeJobs(jobs: ScoredJob[]): ScoredJob[] {
  const byId = new Map<string, ScoredJob>();
  for (const j of jobs) {
    const seen = byId.get(j.id);
    if (!seen) {
      byId.set(j.id, j);
      continue;
    }
    const [keep, other] = j.description.length > seen.description.length ? [j, seen] : [seen, j];
    const links = [...keep.apply, ...other.apply].filter((a, i, all) => all.findIndex((b) => b.url === a.url) === i);
    byId.set(j.id, {
      ...keep,
      apply: links,
      salary: keep.salary ?? other.salary,
      postedAt: keep.postedAt ?? other.postedAt,
      injections: [...new Set([...keep.injections, ...other.injections])],
    });
  }
  return [...byId.values()];
}
