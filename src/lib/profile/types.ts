import { z } from "zod";
import { LANGUAGES } from "../jobs/languages";
import { WORK_STATUSES } from "../jobs/rightToWork";

// The profile is a ledger of small, true statements ("facts") the user has confirmed.
// Every line Gemma writes on a CV must point at the facts it came from, and code
// checks that it does (src/lib/cv/guard.ts). New facts only arrive through import
// or an answer the user approves; the model can propose, never add.

export const FACT_KINDS = ["role", "achievement", "skill", "education", "project", "certification", "language", "leadership", "other"] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export const factSchema = z.object({
  id: z.string(),
  kind: z.enum(FACT_KINDS),
  /** One statement, third person, no first-person pronouns: "Built a 350-member student society from zero". */
  text: z.string().min(3).max(400),
  /** Employer, university or project the fact belongs to. Code groups CV sections by it. */
  org: z.string().nullish(),
  /** Job title, degree name or project name. */
  title: z.string().nullish(),
  /** "2025-04", "2025" or "present". */
  start: z.string().nullish(),
  end: z.string().nullish(),
  where: z.string().nullish(),
  source: z.enum(["cv", "linkedin", "linkedin_export", "answer", "manual", "demo"]),
  confirmed: z.boolean(),
  createdAt: z.string(),
});
export type Fact = z.infer<typeof factSchema>;

export const STAGES = ["student", "graduate", "early", "mid", "experienced", "seasoned"] as const;
export type CareerStage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<CareerStage, string> = {
  student: "Still studying",
  graduate: "Just graduated",
  early: "Up to 2 years working",
  mid: "3 to 5 years working",
  experienced: "5 to 7 years working",
  seasoned: "7 or more years working",
};
/**
 * From 3 years on, the most years a posting can ask for and still reach your deck (src/lib/jobs/rank.ts).
 * The earlier stages have no entry: they keep the early-career deck, with stretch roles as a choice.
 */
const STAGE_REACH: Partial<Record<CareerStage, number>> = { mid: 5, experienced: 7, seasoned: Infinity };
export const yearsReach = (stage: CareerStage | null | undefined): number | undefined => (stage ? STAGE_REACH[stage] : undefined);

export const preferencesSchema = z.object({
  cities: z.array(z.string()),
  remoteOk: z.boolean(),
  stage: z.enum(STAGES).nullable(),
  workStatus: z.enum(WORK_STATUSES).nullable(),
  /** Languages besides English. */
  languages: z.array(z.enum(LANGUAGES)),
  /** Role family ids from src/lib/jobs/categories.ts: "software", "data", "cyber" … */
  roles: z.array(z.string()),
  dealBreakers: z.array(z.string()),
  showStretch: z.boolean(),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const headerSchema = z.object({
  name: z.string(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  location: z.string().nullish(),
  links: z.array(z.string()).default([]),
});
export type Header = z.infer<typeof headerSchema>;

export type Profile = {
  header: Header;
  facts: Fact[];
  /** Things the user never wants claimed: "any certification", "fluent Mandarin". */
  neverClaim: string[];
  preferences: Preferences;
};

export const emptyPreferences = (): Preferences => ({
  cities: [],
  remoteOk: true,
  stage: null,
  workStatus: null,
  languages: [],
  roles: [],
  dealBreakers: [],
  showStretch: false,
});

let counter = 0;
/** Short, unique, readable in prompts ("fk3x907"). Always ends in digits, which is how cleanId spots an id. */
export function newFactId(): string {
  counter = (counter + 1) % 100;
  return `f${Date.now().toString(36).slice(-4)}${String(counter).padStart(2, "0")}`;
}
