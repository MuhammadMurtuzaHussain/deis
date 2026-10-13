import { z } from "zod";

// What Gemma returns. Limits here are generous on purpose: one long field must not
// throw away an otherwise good answer. Code trims to size afterwards (src/lib/cv/guard.ts).
//
// Each piece of writing carries the ids of the facts it came
// from; src/lib/cv/guard.ts checks them before anything reaches the page. The
// header, employers, job titles, dates and education are never written by the model:
// code copies them from the facts.

export const citedSchema = z.object({
  text: z.string().min(1).max(2400),
  facts: z.array(z.string()).max(12).default([]),
});
export type Cited = z.infer<typeof citedSchema>;

export const MATCHES = ["strong", "transferable", "gap"] as const;
export const VERDICTS = ["close", "good", "stretch", "major_stretch"] as const;

export const fitSchema = z.object({
  verdict: z.enum(VERDICTS),
  /** The role's must-haves in its own words, each matched to the candidate's facts. */
  requirements: z
    .array(
      z.object({
        need: z.string().max(640),
        match: z.enum(MATCHES),
        facts: z.array(z.string()).max(12).default([]),
        note: z.string().max(960),
      }),
    )
    .min(1)
    .max(16),
  /** One line: what to lead with for this role. */
  angle: z.string().max(960),
});
export type Fit = z.infer<typeof fitSchema>;

export const cvBodySchema = z.object({
  /** One or two lines naming this role at this employer. */
  objective: z.array(citedSchema).max(3).default([]),
  summary: z.array(citedSchema).min(1).max(8),
  competencies: z
    .array(z.object({ label: z.string().max(400), text: z.string().max(960), facts: z.array(z.string()).max(12).default([]) }))
    .max(14),
  roles: z.array(z.object({ org: z.string(), bullets: z.array(citedSchema).max(12) })).max(16),
  projects: z.array(citedSchema).max(12),
  achievements: z.array(citedSchema).max(12),
  skills: z.array(z.string().max(400)).max(60),
});
export type CvBody = z.infer<typeof cvBodySchema>;

export const letterSchema = z.object({
  paragraphs: z.array(citedSchema).min(1).max(12),
});
export type Letter = z.infer<typeof letterSchema>;

export const answersSchema = z.object({
  answers: z
    .array(
      z.object({
        question: z.string().max(800),
        answer: z.string().max(4800),
        facts: z.array(z.string()).max(12).default([]),
        /** Salary, notice period, start date, referees: only the user can answer. */
        needsYou: z.boolean(),
      }),
    )
    .max(12),
});
export type Answers = z.infer<typeof answersSchema>;

export const gapQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        need: z.string().max(640),
        question: z.string().max(960),
      }),
    )
    .min(1)
    .max(8),
});
export type GapQuestions = z.infer<typeof gapQuestionsSchema>;

/** A fact the model proposes from the user's own answer. It joins the profile only if they approve it. */
export const proposalSchema = z.object({
  proposals: z
    .array(
      z.object({
        kind: z.enum(["role", "achievement", "skill", "education", "project", "certification", "language", "leadership", "other"]),
        text: z.string().max(1600),
        org: z.string().nullish(),
      }),
    )
    .max(8),
});
export type Proposals = z.infer<typeof proposalSchema>;
