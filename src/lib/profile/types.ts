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

export const STAGES = ["student", "graduate", "early"] as const;
export const STAGE_LABEL: Record<(typeof STAGES)[number], string> = {
  student: "Still studying",
  graduate: "Just graduated",
  early: "Up to 2 years working",
};

export const preferencesSchema = z.object({
  cities: z.array(z.string()),
  remoteOk: z.boolean(),
  stage: z.enum(STAGES).nullable(),
  workStatus: z.enum(WORK_STATUSES).nullable(),
  /** Languages besides English. */
  languages: z.array(z.enum(LANGUAGES)),
  /** Free-text role families: "data analyst", "cyber security", "marketing". */
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
/** Short, unique, readable in prompts ("f3k9a"). */
export function newFactId(): string {
  counter = (counter + 1) % 1296;
  return `f${Date.now().toString(36).slice(-4)}${counter.toString(36).padStart(2, "0")}`;
}
