"use client";

import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { useStore } from "@/lib/client/store";
import { CATEGORIES } from "@/lib/jobs/categories";
import { LANGUAGES, type Language } from "@/lib/jobs/languages";
import { WORK_STATUS_LABEL, WORK_STATUSES } from "@/lib/jobs/rightToWork";
import { STAGE_LABEL, STAGES, emptyPreferences, type Preferences } from "@/lib/profile/types";
import { Wordmark } from "./App";
import { Button, Chip } from "./ui";

// The 90-second check-in. One question per screen, tap to answer, every answer
// changeable later in Profile. Each question says why it's asked: everything here
// is a filter on the deck, nothing is sent anywhere.

const CITY_CHOICES = ["Dublin", "Cork", "Galway", "Limerick", "Waterford", "Athlone", "Sligo", "Kilkenny"];
const COMMON_LANGUAGES: Language[] = ["Irish", "French", "German", "Spanish", "Italian", "Polish", "Portuguese", "Dutch", "Ukrainian", "Chinese", "Hindi", "Arabic"];

type Step = { title: string; why: string; valid: (p: Preferences) => boolean; body: (p: Preferences, set: (p: Preferences) => void) => ReactNode };

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

const STEPS: Step[] = [
  {
    title: "Where in Ireland could you work?",
    why: "Pick as many as you like. Deis only shows jobs in these places, plus remote ones if you want them.",
    valid: (p) => p.cities.length > 0 || p.remoteOk,
    body: (p, set) => (
      <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CITY_CHOICES.map((c) => (
            <Chip key={c} on={p.cities.includes(c)} onClick={() => set({ ...p, cities: toggle(p.cities, c) })}>
              {c}
            </Chip>
          ))}
        </div>
        <div className="mt-4">
          <Chip on={p.remoteOk} onClick={() => set({ ...p, remoteOk: !p.remoteOk })}>
            Remote roles in Ireland are fine too
          </Chip>
        </div>
      </>
    ),
  },
  {
    title: "Where are you at?",
    why: "Deis hides jobs that ask for 3 or more years, and labels the ones that ask for 2.",
    valid: (p) => Boolean(p.stage),
    body: (p, set) => (
      <div className="grid gap-2 sm:grid-cols-3">
        {STAGES.map((s) => (
          <Chip key={s} on={p.stage === s} onClick={() => set({ ...p, stage: s })}>
            {STAGE_LABEL[s]}
          </Chip>
        ))}
      </div>
    ),
  },
  {
    title: "Can you work in Ireland now?",
    why: "Some postings rule out sponsorship or limit who can apply. Deis reads that for you and hides the ones that rule you out. This stays on your device.",
    valid: (p) => Boolean(p.workStatus),
    body: (p, set) => (
      <div className="grid gap-2 sm:grid-cols-2">
        {WORK_STATUSES.map((s) => (
          <Chip key={s} on={p.workStatus === s} onClick={() => set({ ...p, workStatus: s })}>
            {WORK_STATUS_LABEL[s]}
          </Chip>
        ))}
      </div>
    ),
  },
  {
    title: "What kind of work are you after?",
    why: "Up to five. Each one is a shared search across Ireland, so pick the ones you'd really apply for.",
    valid: (p) => p.roles.length > 0,
    body: (p, set) => (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((c) => (
          <Chip key={c.id} on={p.roles.includes(c.id)} disabled={!p.roles.includes(c.id) && p.roles.length >= 5} onClick={() => set({ ...p, roles: toggle(p.roles, c.id) })}>
            {c.label}
          </Chip>
        ))}
      </div>
    ),
  },
  {
    title: "Any languages besides English?",
    why: "Lots of Dublin roles need a second language. Deis hides the ones that need a language you don't have. Skip if it's just English.",
    valid: () => true,
    body: (p, set) => (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {COMMON_LANGUAGES.filter((l) => LANGUAGES.includes(l)).map((l) => (
          <Chip key={l} on={p.languages.includes(l)} onClick={() => set({ ...p, languages: toggle(p.languages, l) })}>
            {l}
          </Chip>
        ))}
      </div>
    ),
  },
  {
    title: "Show roles that ask for 2 years?",
    why: "Plenty of graduates get these. Deis labels them as a stretch so you can decide card by card.",
    valid: () => true,
    body: (p, set) => (
      <div className="grid gap-2 sm:grid-cols-2">
        <Chip on={p.showStretch} onClick={() => set({ ...p, showStretch: true })}>
          Yes, show me stretch roles
        </Chip>
        <Chip on={!p.showStretch} onClick={() => set({ ...p, showStretch: false })}>
          No, early career only
        </Chip>
      </div>
    ),
  },
];

export function CheckIn() {
  const { profile, setPreferences, go, ai, status } = useStore();
  const [prefs, setPrefs] = useState<Preferences>(() => ({ ...emptyPreferences(), ...profile?.preferences }));
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const next = async () => {
    await setPreferences(prefs);
    if (!last) return setI(i + 1);
    // Next: get a profile in. That needs a model unless the web demo's own Gemma is there.
    const needsModel = !ai && !(status?.hosted && status.demoModel);
    go({ name: needsModel ? "model" : "profile" });
  };

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-4 sm:px-8">
      <header className="flex h-20 items-center justify-between">
        <Wordmark />
        <p className="num text-sm text-ink-3" aria-live="polite">
          {i + 1} of {STEPS.length}
        </p>
      </header>

      <section aria-labelledby="q" className="flex-1 py-8">
        <h1 id="q" className="text-3xl font-bold leading-tight text-balance md:text-4xl">
          {step.title}
        </h1>
        <p className="mt-3 max-w-[60ch] text-ink-2">{step.why}</p>
        <div className="mt-8">{step.body(prefs, setPrefs)}</div>
      </section>

      <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-bg py-4">
        <Button variant="ghost" onClick={() => (i === 0 ? go({ name: "welcome" }) : setI(i - 1))}>
          <ArrowLeft size={18} aria-hidden />
          Back
        </Button>
        <Button variant="primary" onClick={next} disabled={!step.valid(prefs)}>
          {last ? "Now, your CV" : "Continue"}
          <ArrowRight size={18} aria-hidden />
        </Button>
      </footer>
    </main>
  );
}
