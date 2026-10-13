import { z } from "zod";

// What Gemma returns. Each piece of writing carries the ids of the facts it came
// from; src/lib/cv/guard.ts checks them before anything reaches the page. The
// header, employers, job titles, dates and education are never written by the model:
// code copies them from the facts.

export const citedSchema = z.object({
  text: z.string().min(1).max(600),
  facts: z.array(z.string()).max(6),
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
        need: z.string().max(160),
        match: z.enum(MATCHES),
        facts: z.array(z.string()).max(4),
        note: z.string().max(240),
      }),
    )
    .min(1)
    .max(10),
  /** One line: what to lead with for this role. */
  angle: z.string().max(240),
});
export type Fit = z.infer<typeof fitSchema>;

export const cvBodySchema = z.object({
  summary: z.array(citedSchema).min(1).max(4),
  competencies: z
    .array(z.object({ label: z.string().max(40), text: z.string().max(240), facts: z.array(z.string()).max(4) }))
    .max(7),
  roles: z.array(z.object({ org: z.string(), bullets: z.array(citedSchema).max(6) })).max(8),
  projects: z.array(citedSchema).max(6),
  achievements: z.array(citedSchema).max(6),
  skills: z.array(z.string().max(60)).max(30),
});
export type CvBody = z.infer<typeof cvBodySchema>;

export const letterSchema = z.object({
  paragraphs: z.array(citedSchema).min(3).max(6),
});
export type Letter = z.infer<typeof letterSchema>;

export const answersSchema = z.object({
  answers: z
    .array(
      z.object({
        question: z.string().max(200),
        answer: z.string().max(1200),
        facts: z.array(z.string()).max(6),
        /** Salary, notice period, start date, referees: only the user can answer. */
        needsYou: z.boolean(),
      }),
    )
    .max(8),
});
export type Answers = z.infer<typeof answersSchema>;

export const gapQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        need: z.string().max(160),
        question: z.string().max(240),
      }),
    )
    .min(1)
    .max(5),
});
export type GapQuestions = z.infer<typeof gapQuestionsSchema>;

/** A fact the model proposes from the user's own answer. It joins the profile only if they approve it. */
export const proposalSchema = z.object({
  proposals: z
    .array(
      z.object({
        kind: z.enum(["role", "achievement", "skill", "education", "project", "certification", "language", "leadership", "other"]),
        text: z.string().max(400),
        org: z.string().nullish(),
      }),
    )
    .max(6),
});
export type Proposals = z.infer<typeof proposalSchema>;
