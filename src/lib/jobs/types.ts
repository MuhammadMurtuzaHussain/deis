import { z } from "zod";
import type { Language } from "./languages";

// One job, whichever board it came from. Everything the deck shows is derived from
// these fields by code (seniority, right to work, location); Gemma only adds the
// three "why" lines on the card and never decides whether a job is shown.

export const sourceSchema = z.enum(["greenhouse", "ashby", "google_jobs", "pasted"]);
export type Source = z.infer<typeof sourceSchema>;

export const applyLinkSchema = z.object({ label: z.string(), url: z.string().url() });

export const jobSchema = z.object({
  /** Stable across sources: company + title + city, so the same role from two boards merges. */
  id: z.string(),
  source: sourceSchema,
  title: z.string(),
  company: z.string(),
  location: z.string(),
  /** Normalised Irish city, "Remote (Ireland)" or "Ireland" when the board doesn't say. */
  city: z.string(),
  remote: z.boolean(),
  /** ISO date, or null when the board doesn't say. */
  postedAt: z.string().nullable(),
  /** Plain text, sanitised (see sanitize.ts). */
  description: z.string(),
  salary: z.string().nullable(),
  apply: z.array(applyLinkSchema),
  /** Where the full posting lives, for "open original". */
  url: z.string().url(),
});
export type Job = z.infer<typeof jobSchema>;

export const LEVELS = ["early", "open", "stretch", "senior"] as const;
export type Level = (typeof LEVELS)[number];

export type Seniority = {
  level: Level;
  /** Highest years-of-experience figure the posting asks for, if any. */
  yearsMin: number | null;
  /** Short quote from the posting that decided the level, shown on the card. */
  evidence: string | null;
  /** Needs current enrolment (an internship, placement or co-op). Missing on jobs scored before 16 Oct 2026. */
  studentOnly?: boolean;
};

export type WorkStance = "sponsors" | "no_sponsorship" | "eu_only" | "right_to_work" | "unknown";
export type RightToWork = { stance: WorkStance; evidence: string | null };

/** A job with everything code worked out about it. */
export type ScoredJob = Job & {
  seniority: Seniority;
  rightToWork: RightToWork;
  /** Instruction-like text found in the posting (prompt injection). Shown to the user, never obeyed. */
  injections: string[];
  /** Languages besides English the role needs; each inner list is "any one of". */
  languages: Language[][];
};
