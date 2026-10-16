"use client";

import { ArrowLeft, ArrowRight, PencilSimple } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/client/store";
import { emptyPreferences, type Preferences } from "@/lib/profile/types";
import { STEPS, summary } from "./onboarding/steps";
import { Button, Notice, useMotion, Wordmark } from "./ui";

// The 90-second check-in (v3). One question per screen in Bricolage, pill chips (ink when
// selected) and a thin ink progress bar, tap to answer, then a summary to check
// before going on. Every answer can be changed later in Profile. There's no PageHeader
// here, so moving between steps sets the focus and document.title itself (the shell only
// does that on a route change).

const TOTAL = STEPS.length + 1;

export function CheckIn() {
  const { profile, setPreferences, go, ai, status, effectiveModel } = useStore();
  const [prefs, setPrefs] = useState<Preferences>(() => ({
    ...emptyPreferences(),
    ...profile?.preferences,
  }));
  const [i, setI] = useState(0);
  // Which way the questions slide: forward from the right, back from the left.
  const [dir, setDir] = useState(1);
  const go1 = (to: number) => {
    setDir(to >= i ? 1 : -1);
    setI(to);
  };
  const { reduce, t } = useMotion();
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
    // The new question mounts once the old one has slid out (onExitComplete below) and takes focus then.
  }, [i, title]);
  const focusQuestion = () => requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));

  const next = async () => {
    await setPreferences(prefs);
    go1(returnToSummary ? STEPS.length : i + 1);
    setReturnToSummary(false);
  };

  const finish = async () => {
    await setPreferences(prefs);
    // Next: get a profile in. That needs a model unless the web demo's own Gemma is there.
    const needsModel = !ai && !(status?.hosted && status.demoModel) && !effectiveModel.standIn;
    go({ name: needsModel ? "model" : "profile" });
  };

  const back = () => (i === 0 ? go({ name: "welcome" }) : go1(i - 1));
  const said = summary(prefs);
  const allValid = STEPS.every((s) => s.valid(prefs));

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col px-4 sm:px-8">
      <header className="pt-4">
        <div className="flex h-12 items-center justify-between gap-4">
          <Wordmark />
          <p className="font-mono text-[12px] text-ink-3">
            <span className="sr-only">Step </span>
            {i + 1}
            <span aria-hidden> / </span>
            <span className="sr-only"> of </span>
            {TOTAL}
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="Check-in progress"
          aria-valuemin={1}
          aria-valuemax={TOTAL}
          aria-valuenow={i + 1}
          aria-valuetext={`Step ${i + 1} of ${TOTAL}`}
          className="mt-2 h-[3px] overflow-hidden rounded-full bg-line"
        >
          <motion.div className="h-full origin-left rounded-full bg-ink" initial={false} animate={{ scaleX: (i + 1) / TOTAL }} transition={t({ type: "spring", stiffness: 260, damping: 24 })} />
        </div>
      </header>

      <main aria-labelledby="q" className="flex-1 overflow-x-clip pt-12 pb-10 sm:pt-20">
        <AnimatePresence mode="wait" initial={false} custom={dir} onExitComplete={focusQuestion}>
          <motion.div
            key={i}
            custom={dir}
            variants={{
              enter: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: 48 * d, filter: "blur(6px)" }),
              in: { opacity: 1, x: 0, filter: "blur(0px)" },
              exit: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: -48 * d, filter: "blur(6px)" }),
            }}
            initial="enter"
            animate="in"
            exit="exit"
            transition={t({
              type: "spring",
              stiffness: 380,
              damping: 36,
              opacity: { duration: 0.18 },
            })}
          >
            <h1 id="q" ref={heading} tabIndex={-1} data-page-title className="display max-w-[18ch] text-[34px] leading-[1.05] text-ink text-balance outline-none sm:text-[44px]">
              {title}
            </h1>

            {atSummary ? (
              <>
                <p className="mt-4 max-w-[56ch] text-body text-ink-2 sm:text-[16px]">This is what Deis filters the deck by. You can change any of it later in Profile.</p>
                <dl className="mt-10 divide-y divide-line rounded-panel border border-line bg-surface">
                  {STEPS.map((s, n) => (
                    <div key={s.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3 pr-2 pl-5">
                      <div className="min-w-0 flex-1">
                        <dt className="text-caption text-ink-3">{s.short}</dt>
                        <dd className="text-body text-ink">{said[s.id]}</dd>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setReturnToSummary(true);
                          go1(n);
                        }}
                      >
                        <PencilSimple size={16} aria-hidden />
                        Change
                        <span className="sr-only"> {s.short.toLowerCase()}</span>
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
                <p className="mt-4 max-w-[56ch] text-body text-ink-2 sm:text-[16px]">{step.why}</p>
                <div className="mt-10">{step.body(prefs, setPrefs)}</div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-line bg-bg/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:-mx-8 sm:px-8">
        <Button variant="ghost" onClick={back}>
          <ArrowLeft size={18} aria-hidden />
          Back
        </Button>
        {atSummary ? (
          <Button variant="primary" onClick={finish} disabled={!allValid}>
            Now, your CV
            <ArrowRight size={18} weight="bold" aria-hidden />
          </Button>
        ) : (
          <Button variant="primary" onClick={next} disabled={!step.valid(prefs)}>
            {returnToSummary ? "Back to the summary" : "Continue"}
            <ArrowRight size={18} weight="bold" aria-hidden />
          </Button>
        )}
      </footer>
    </div>
  );
}
