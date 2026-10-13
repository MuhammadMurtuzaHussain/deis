import { z } from "zod";
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
        text: z.string().min(2).max(400),
        org: z.string().nullish(),
        title: z.string().nullish(),
        start: z.string().nullish(),
        end: z.string().nullish(),
      }),
    )
    .max(80),
});
export type Extracted = z.infer<typeof extractSchema>;

export const cardSchema = z.object({
  why: z
    .array(
      z.object({
        kind: z.enum(["strong", "transferable", "gap"]),
        text: z.string().max(140),
        facts: z.array(z.string()).max(4).default([]),
      }),
    )
    .min(1)
    .max(3),
  score: z.number().min(0).max(100),
});
export type CardWhy = z.infer<typeof cardSchema>;
