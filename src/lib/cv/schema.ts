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

/**
 * What Gemma writes for a CV: a short profile, key skill labels, bullets for each
 * employer, projects and tools. Education, certifications and languages are copied
 * from the facts by code (src/lib/cv/compose.ts).
 */
export const cvDraftSchema = z.object({
  /** 2 or 3 sentences at the top of the CV. */
  profile: z.array(citedSchema).min(1).max(6),
  /** Short labels ("Unit testing"), each citing the facts that show it. */
  keySkills: z.array(z.object({ label: z.string().max(400), facts: z.array(z.string()).max(12).default([]) })).max(12).default([]),
  roles: z.array(z.object({ org: z.string(), bullets: z.array(citedSchema).max(12) })).max(16).default([]),
  projects: z.array(citedSchema).max(12).default([]),
  skills: z.array(z.string().max(400)).max(60).default([]),
});
export type CvDraft = z.infer<typeof cvDraftSchema>;

/** The shape the guard checks (src/lib/cv/guard.ts). Prompts before 16 Oct 2026 asked Gemma for it directly. */
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

/**
 * The draft in the guard's shape. The profile's first sentence names the role as advertised,
 * so it goes where the guard lets the posting's numbers stand ("Graduate Programme 2027");
 * key skills are competencies with no sentence.
 */
export function bodyFromDraft(d: CvDraft): CvBody {
  const sentences = d.profile.flatMap((p) => p.text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((text) => ({ text, facts: p.facts })));
  return {
    objective: sentences.slice(0, 1),
    summary: sentences.slice(1),
    competencies: d.keySkills.map((k) => ({ label: k.label, text: "", facts: k.facts })),
    roles: d.roles,
    projects: d.projects,
    achievements: [],
    skills: d.skills,
  };
}

/** Bumped when the guard or the kit's layout changes, so the app can tell a kit was checked by older rules. 2: 16 Oct 2026. */
export const GUARD_VERSION = 2;

export const letterSchema = z.object({
  paragraphs: z.array(citedSchema).min(1).max(12),
});
export type Letter = z.infer<typeof letterSchema>;

/** What Gemma writes for the form. Code owns the questions, so none of them can leak prompt text. */
const draftAnswer = z.object({ answer: z.string().max(4800).default(""), facts: z.array(z.string()).max(12).default([]) });
export const answersDraftSchema = z.object({ why_company: draftAnswer, why_fit: draftAnswer, proud_of: draftAnswer });
export type AnswersDraft = z.infer<typeof answersDraftSchema>;

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
