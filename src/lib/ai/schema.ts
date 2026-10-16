import { z } from "zod";
import { linkedinDate, tidyImported } from "../import/linkedin";
import { FACT_KINDS } from "../profile/types";

// Output schemas for the import and the deck. The CV-side schemas live in src/lib/cv/schema.ts.

export const extractSchema = z.object({
  header: z.object({
    name: z.string().nullish(),
    email: z.string().nullish(),
    phone: z.string().nullish(),
    location: z.string().nullish(),
    links: z.array(z.string()).nullish(),
  }),
  facts: z
    .array(
      z.object({
        kind: z.enum(FACT_KINDS),
        text: z.string().min(2).max(1600),
        org: z.string().nullish(),
        title: z.string().nullish(),
        start: z.string().nullish(),
        end: z.string().nullish(),
        where: z.string().nullish(),
      }),
    )
    .max(80),
});
export type Extracted = z.infer<typeof extractSchema>;

/** "Sept 2021" → "2021-09", "06/2023" → "2023-06"; "2025-04", "2025" and "present" stay. Roles sort by these. */
function isoDate(d: string | null | undefined): string | null {
  const s = d?.trim();
  if (!s) return null;
  if (/^(present|current|now)$/i.test(s)) return "present";
  if (/^\d{4}(-\d{1,2})?$/.test(s)) return s;
  const slash = /^(\d{1,2})\/(\d{4})$/.exec(s);
  if (slash) return `${slash[2]}-${slash[1].padStart(2, "0")}`;
  return linkedinDate(s) ?? s;
}

/**
 * Code tidies what the import model wrote: dates it can sort, languages as "Irish (fluent)",
 * one-field ranges split, and skill qualifiers the CV (`source`) never used dropped.
 */
export const tidyFacts = (facts: Extracted["facts"], source = ""): Extracted["facts"] =>
  facts.map((f) => {
    const t = tidyImported(f, source);
    return { ...t, start: isoDate(t.start), end: isoDate(t.end) };
  });

export const cardSchema = z.object({
  why: z
    .array(
      z.object({
        kind: z.enum(["strong", "transferable", "gap"]),
        text: z.string().max(560),
        facts: z.array(z.string()).max(12).default([]),
      }),
    )
    .min(1)
    .max(6),
});
/** The card route's answer: the guarded lines, and a score code derives from them (Gemma's own number was never shown). */
export type CardWhy = z.infer<typeof cardSchema> & { score: number };
