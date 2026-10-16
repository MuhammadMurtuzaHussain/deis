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
 * What Gemma writes for a CV, in the shape of a hand-tailored Irish CV: a professional
 * summary that opens with who the candidate is and ends with what they want from this role,
 * core competencies as "Label: one sentence", bullets for each employer, projects, the
 * achievements to show (as fact ids: code copies them word for word) and tools. Education,
 * certifications and languages are copied from the facts by code (src/lib/cv/compose.ts).
 */
const competencySchema = z.object({ label: z.string().max(400), text: z.string().max(960).default(""), facts: z.array(z.string()).max(12).default([]) });
export const cvDraftSchema = z.object({
  /** The summary: who the candidate is, then the evidence. */
  profile: z.array(citedSchema).min(1).max(8),
  /** The career objective: one closing sentence on what they want to do in this role. */
  aim: citedSchema.nullish(),
  competencies: z.array(competencySchema).max(12).default([]),
  /** Kits drafted before 17 Oct 2026: labels only. */
  keySkills: z.array(z.object({ label: z.string().max(400), facts: z.array(z.string()).max(12).default([]) })).max(12).default([]),
  roles: z.array(z.object({ org: z.string(), bullets: z.array(citedSchema).max(12) })).max(16).default([]),
  projects: z.array(citedSchema).max(12).default([]),
  /** Ids of achievement facts, most relevant first. */
  achievements: z.array(z.string()).max(12).default([]),
  skills: z.array(z.string().max(400)).max(60).default([]),
});
export type CvDraft = z.input<typeof cvDraftSchema>;

/** One page for a graduate who wants it short, two for the full, hand-tailored kind. */
export const CV_LENGTHS = ["detailed", "short"] as const;
export type CvLength = (typeof CV_LENGTHS)[number];

/** The shape the guard checks (src/lib/cv/guard.ts). Prompts before 16 Oct 2026 asked Gemma for it directly. */
export const cvBodySchema = z.object({
  /** One or two lines naming this role at this employer. */
  objective: z.array(citedSchema).max(3).default([]),
  summary: z.array(citedSchema).min(1).max(8),
  /** The closing career objective. Guarded like the objective, so it may name the role as advertised. */
  aim: z.array(citedSchema).max(2).optional(),
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
 * so it goes where the guard lets the posting's numbers stand ("Graduate Programme 2027"), and
 * so does the closing aim. Achievements are the user's own facts, word for word.
 */
export function bodyFromDraft(d: CvDraft, facts: { id: string; text: string; kind: string }[] = []): CvBody {
  const sentences = d.profile.flatMap((p) => p.text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((text) => ({ text, facts: p.facts ?? [] })));
  const byId = new Map(facts.map((f) => [f.id, f]));
  const achievements = [...new Set(d.achievements ?? [])]
    .map((id) => byId.get(id.trim()))
    .filter((f): f is { id: string; text: string; kind: string } => f?.kind === "achievement")
    .map((f) => ({ text: f.text, facts: [f.id] }));
  return {
    objective: sentences.slice(0, 1),
    summary: sentences.slice(1),
    aim: d.aim?.text ? [{ text: d.aim.text, facts: d.aim.facts ?? [] }] : [],
    competencies: [...(d.competencies ?? []), ...(d.keySkills ?? []).map((k) => ({ ...k, text: "" }))].map((c) => ({ label: c.label, text: c.text ?? "", facts: c.facts ?? [] })),
    roles: (d.roles ?? []).map((r) => ({ org: r.org, bullets: r.bullets.map((b) => ({ text: b.text, facts: b.facts ?? [] })) })),
    projects: (d.projects ?? []).map((p) => ({ text: p.text, facts: p.facts ?? [] })),
    achievements,
    skills: d.skills ?? [],
  };
}

/** Bumped when the guard or the kit's layout changes, so the app can tell a kit was checked by older rules. 2: 16 Oct 2026. 3: 17 Oct 2026, full-length CV. */
export const GUARD_VERSION = 3;

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
