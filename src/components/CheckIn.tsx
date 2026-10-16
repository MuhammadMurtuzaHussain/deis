"use client";

import { ArrowLeft, ArrowRight, PencilSimple } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/client/store";
import { emptyPreferences, type Preferences } from "@/lib/profile/types";
import { STEPS, summary } from "./onboarding/steps";
import { Button, Notice, StepBar, Wordmark } from "./ui";

// The 90-second check-in. One question per screen, tap to answer, then a summary to check
// before going on. Every answer can be changed later in Profile. There's no PageHeader
// here, so moving between steps sets the focus and document.title itself (the shell only
// does that on a route change).

const TOTAL = STEPS.length + 1;

export function CheckIn() {
  const { profile, setPreferences, go, ai, status, effectiveModel } = useStore();
  const [prefs, setPrefs] = useState<Preferences>(() => ({ ...emptyPreferences(), ...profile?.preferences }));
  const [i, setI] = useState(0);
  // From the summary, "Change" goes to one step and Continue comes straight back.
  const [returnToSummary, setReturnToSummary] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const atSummary = i === STEPS.length;
  const step = STEPS[i];
  const title = atSummary ? "Check your answers" : step.title;

  useEffect(() => {
    document.title = `${title} · Deis`;
    // The first step is focused by the shell's route change; later ones by us.
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [i, title]);

  const next = async () => {
    await setPreferences(prefs);
    setI(returnToSummary ? STEPS.length : i + 1);
    setReturnToSummary(false);
  };

  const finish = async () => {
    await setPreferences(prefs);
    // Next: get a profile in. That needs a model unless the web demo's own Gemma is there.
    const needsModel = !ai && !(status?.hosted && status.demoModel) && !effectiveModel.standIn;
    go({ name: needsModel ? "model" : "profile" });
  };

  const back = () => (i === 0 ? go({ name: "welcome" }) : setI(i - 1));
  const said = summary(prefs);
  const allValid = STEPS.every((s) => s.valid(prefs));

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 sm:px-8">
      <header className="grid gap-3 pt-5 pb-2">
        <div className="flex items-center justify-between gap-4">
          <Wordmark />
          <p className="num text-caption text-ink-2">
            Step {i + 1} of {TOTAL}
          </p>
        </div>
        <StepBar total={TOTAL} current={i + 1} label="Check-in progress" />
      </header>

      <section aria-labelledby="q" className="flex-1 py-8 sm:py-12">
        <p aria-hidden="true" lang="ga" className="eyebrow mb-1">
          {atSummary ? "Achoimre" : "Ceisteanna"}
        </p>
        <h1 id="q" ref={heading} tabIndex={-1} data-page-title className="display text-title text-ink text-balance outline-none sm:text-page">
          {title}
        </h1>

        {atSummary ? (
          <>
            <p className="mt-3 max-w-[60ch] text-body text-ink-2 sm:text-[16px]">This is what Deis filters the deck by. You can change any of it later in Profile.</p>
            <dl className="mt-8 divide-y divide-line rounded-surface border border-line bg-raised shadow-card">
              {STEPS.map((s, n) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <dt className="text-caption text-ink-3">{s.short}</dt>
                    <dd className="text-body text-ink">{said[s.id]}</dd>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setReturnToSummary(true);
                      setI(n);
                    }}
                  >
                    <PencilSimple size={16} aria-hidden />
                    Change<span className="sr-only"> {s.short.toLowerCase()}</span>
                  </Button>
                </div>
              ))}
            </dl>
            {!allValid && (
              <Notice tone="warn" className="mt-4">
                A question still needs an answer. Use Change to go back to it.
              </Notice>
            )}
          </>
        ) : (
          <>
            <p className="mt-3 max-w-[60ch] text-body text-ink-2 sm:text-[16px]">{step.why}</p>
            <div className="mt-8">{step.body(prefs, setPrefs)}</div>
          </>
        )}
      </section>

      <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-bg py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="ghost" onClick={back}>
          <ArrowLeft size={18} aria-hidden />
          Back
        </Button>
        {atSummary ? (
          <Button variant="primary" onClick={finish} disabled={!allValid}>
            Now, your CV
            <ArrowRight size={18} aria-hidden />
          </Button>
        ) : (
          <Button variant="primary" onClick={next} disabled={!step.valid(prefs)}>
            {returnToSummary ? "Back to the summary" : "Continue"}
            <ArrowRight size={18} aria-hidden />
          </Button>
        )}
      </footer>
    </main>
  );
}
