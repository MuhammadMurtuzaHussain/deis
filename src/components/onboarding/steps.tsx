"use client";

import type { ReactNode } from "react";
import { CATEGORIES, categoryById } from "@/lib/jobs/categories";
import { LANGUAGES, type Language } from "@/lib/jobs/languages";
import { WORK_STATUS_LABEL, WORK_STATUSES } from "@/lib/jobs/rightToWork";
import { STAGE_LABEL, STAGES, type Preferences } from "@/lib/profile/types";
import { Chip } from "../ui";

// The check-in's questions. Each one is a filter on the deck and says why it's asked;
// summary() is the same answers in words for the last step and the Profile screen.

const CITY_CHOICES = ["Dublin", "Cork", "Galway", "Limerick", "Waterford", "Athlone", "Sligo", "Kilkenny"];
const COMMON_LANGUAGES: Language[] = ["Irish", "French", "German", "Spanish", "Italian", "Polish", "Portuguese", "Dutch", "Ukrainian", "Chinese", "Hindi", "Arabic"];

/** What each stage changes on the deck (src/lib/jobs/rank.ts): students see internships first; graduates don't see student-only roles. */
const STAGE_HELP: Record<(typeof STAGES)[number], string> = {
  student: "Internships and placements come first.",
  graduate: "Roles only open to current students are hidden.",
  early: "Roles only open to current students are hidden.",
};

export type Step = { id: string; title: string; short: string; why: string; valid: (p: Preferences) => boolean; body: (p: Preferences, set: (p: Preferences) => void) => ReactNode };

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** A labelled group of chips: two columns from small screens up. */
function Choices({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={`grid gap-2 ${wide ? "grid-cols-2 sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {children}
    </div>
  );
}

export const STEPS: Step[] = [
  {
    id: "places",
    title: "Where in Ireland could you work?",
    short: "Places",
    why: "Pick as many as you like. Deis only shows jobs in these places, plus remote ones if you want them.",
    valid: (p) => p.cities.length > 0 || p.remoteOk,
    body: (p, set) => (
      <div className="grid gap-4">
        <Choices label="Places" wide>
          {CITY_CHOICES.map((c) => (
            <Chip key={c} on={p.cities.includes(c)} onClick={() => set({ ...p, cities: toggle(p.cities, c) })}>
              {c}
            </Chip>
          ))}
        </Choices>
        <Choices label="Remote work">
          <Chip on={p.remoteOk} onClick={() => set({ ...p, remoteOk: !p.remoteOk })}>
            Remote roles in Ireland are fine too
          </Chip>
        </Choices>
      </div>
    ),
  },
  {
    id: "stage",
    title: "Where are you at?",
    short: "Stage",
    why: "Deis hides jobs that ask for 3 or more years, and labels the ones that ask for about 2.",
    valid: (p) => Boolean(p.stage),
    body: (p, set) => (
      <Choices label="Stage">
        {STAGES.map((s) => (
          <Chip key={s} on={p.stage === s} onClick={() => set({ ...p, stage: s })}>
            <span className="block">{STAGE_LABEL[s]}</span>
            <span className="block text-caption font-normal text-ink-2">{STAGE_HELP[s]}</span>
          </Chip>
        ))}
      </Choices>
    ),
  },
  {
    id: "work",
    title: "Can you work in Ireland now?",
    short: "Right to work",
    why: "Some postings rule out sponsorship or limit who can apply. Deis reads that for you and hides the ones that rule you out. Your answer is only used on this device to filter jobs.",
    valid: (p) => Boolean(p.workStatus),
    body: (p, set) => (
      <Choices label="Right to work">
        {WORK_STATUSES.map((s) => (
          <Chip key={s} on={p.workStatus === s} onClick={() => set({ ...p, workStatus: s })}>
            {WORK_STATUS_LABEL[s]}
          </Chip>
        ))}
      </Choices>
    ),
  },
  {
    id: "roles",
    title: "What kind of work are you after?",
    short: "Kinds of work",
    why: "Up to five. Each one is a shared search across Ireland, so pick the ones you'd really apply for.",
    valid: (p) => p.roles.length > 0,
    body: (p, set) => (
      <Choices label="Kinds of work">
        {CATEGORIES.map((c) => (
          <Chip key={c.id} on={p.roles.includes(c.id)} disabled={!p.roles.includes(c.id) && p.roles.length >= 5} onClick={() => set({ ...p, roles: toggle(p.roles, c.id) })}>
            {c.label}
          </Chip>
        ))}
      </Choices>
    ),
  },
  {
    id: "languages",
    title: "Any languages besides English?",
    short: "Languages",
    why: "Lots of Dublin roles need a second language. Deis hides the ones that need a language you don't have. Skip if it's just English.",
    valid: () => true,
    body: (p, set) => (
      <Choices label="Languages" wide>
        {COMMON_LANGUAGES.filter((l) => LANGUAGES.includes(l)).map((l) => (
          <Chip key={l} on={p.languages.includes(l)} onClick={() => set({ ...p, languages: toggle(p.languages, l) })}>
            {l}
          </Chip>
        ))}
      </Choices>
    ),
  },
  {
    id: "stretch",
    title: "Show roles that ask for about 2 years?",
    short: "Stretch roles",
    why: "Plenty of graduates get these. Deis labels them as a stretch so you can decide card by card.",
    valid: () => true,
    body: (p, set) => (
      <Choices label="Stretch roles">
        <Chip on={p.showStretch} onClick={() => set({ ...p, showStretch: true })}>
          Yes, show me stretch roles
        </Chip>
        <Chip on={!p.showStretch} onClick={() => set({ ...p, showStretch: false })}>
          No, early career only
        </Chip>
      </Choices>
    ),
  },
];

/** The answers in words, keyed by step id, for the summary step. */
export function summary(p: Preferences): Record<string, string> {
  return {
    places: [...p.cities, p.remoteOk ? "remote in Ireland" : null].filter(Boolean).join(", ") || "Anywhere in Ireland",
    stage: p.stage ? STAGE_LABEL[p.stage] : "Not set",
    work: p.workStatus ? WORK_STATUS_LABEL[p.workStatus] : "Not set",
    roles: p.roles.map((r) => categoryById(r)?.label ?? r).join(", ") || "Not set",
    languages: p.languages.join(", ") || "Just English",
    stretch: p.showStretch ? "Shown, labelled as a stretch" : "Hidden",
  };
}
