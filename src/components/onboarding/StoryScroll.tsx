"use client";

import { motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { JobCard } from "../JobCard";
import { useMotion } from "../ui";
import { FitPanel, SAMPLE_JOB, SAMPLE_WHY, TraceDemo } from "./Story";

// Welcome's story, driven by scroll (useScroll on the section, no window listeners): the left
// pane pins while the right side moves from the card, to the fit check, to the traced CV.
// Captions on the left follow. On phones and under reduced motion it's a plain stack of the
// three steps, each caption above its picture.

const STEPS = [
  { title: "A card you can trust", text: "Code reads the level and right to work from the posting and quotes it. Gemma only says how you match." },
  { title: "An honest fit", text: "Each must-have is matched to a fact you gave, or named as a gap you can answer." },
  { title: "A CV you can stand over", text: "Every line points to a fact you confirmed. Pick one to see its lines. Anything Deis can't trace is removed." },
];

function pictures(step: number, live: boolean): ReactNode[] {
  return [<JobCard key="card" job={SAMPLE_JOB} work="ok" why={SAMPLE_WHY} preview active={!live || step === 0} />, <FitPanel key="fit" />, <TraceDemo key="cv" stacked play={!live || step === 2} />];
}

export function StoryScroll({ headingId }: { headingId: string }) {
  const { reduce } = useMotion();
  const heading = (
    <>
      <h2 id={headingId} className="display text-[32px] leading-[1.05] text-ink sm:text-page">
        Every line comes from you
      </h2>
      <p className="mt-4 max-w-[44ch] text-lead text-ink-2">From a card to a CV, Gemma writes and code checks.</p>
    </>
  );
  return (
    <>
      {!reduce && (
        <div className="hidden lg:block">
          <Pinned heading={heading} />
        </div>
      )}
      <div className={`grid gap-12 py-16 ${reduce ? "" : "lg:hidden"}`}>
        <div>{heading}</div>
        {pictures(0, false).map((p, i) => (
          <div key={STEPS[i].title} className="grid gap-5">
            <div className="max-w-[52ch]">
              <h3 className="text-lead font-semibold text-ink">{STEPS[i].title}</h3>
              <p className="mt-1 text-body text-ink-2">{STEPS[i].text}</p>
            </div>
            <div className="w-full max-w-[460px]">{p}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function Pinned({ heading }: { heading: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [step, setStep] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setStep(v < 0.34 ? 0 : v < 0.67 ? 1 : 2));
  const shown = pictures(step, true);
  return (
    <div ref={ref} className="relative h-[290vh]">
      <div className="sticky top-0 grid h-dvh grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-center gap-16">
        <div>
          {heading}
          <ol className="mt-10 grid gap-1">
            {STEPS.map((s, i) => (
              <li key={s.title} aria-current={step === i ? "step" : undefined} className="relative grid grid-cols-[3px_1fr] gap-5 py-3">
                <span aria-hidden className="relative overflow-hidden rounded-full bg-line">
                  <Fill progress={scrollYProgress} from={i / 3} to={(i + 1) / 3} />
                </span>
                <span className={`transition-colors duration-300 ${step === i ? "text-ink" : "text-ink-3"}`}>
                  <span className="block text-lead font-semibold">{s.title}</span>
                  <motion.span className="block max-w-[44ch] pt-1 text-body text-ink-2" initial={false} animate={{ opacity: step === i ? 1 : 0.45 }} transition={{ duration: 0.3 }}>
                    {s.text}
                  </motion.span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="relative h-[560px] w-full max-w-[480px] justify-self-center">
          {shown.map((p, i) => (
            <Layer key={i} progress={scrollYProgress} index={i} active={step === i}>
              {p}
            </Layer>
          ))}
        </div>
      </div>
    </div>
  );
}

/** One of the three pictures: fades, rises and un-blurs in over its third of the scroll, then hands over. */
function Layer({ progress, index, active, children }: { progress: MotionValue<number>; index: number; active: boolean; children: ReactNode }) {
  const a = index / 3;
  const b = (index + 1) / 3;
  const first = index === 0;
  const last = index === 2;
  // Scroll-linked values may run on the compositor, which needs offsets inside 0..1 and in order.
  const at = first ? [0, 0.01, b - 0.04, b + 0.06] : last ? [a - 0.06, a + 0.04, 0.99, 1] : [a - 0.06, a + 0.04, b - 0.04, b + 0.06];
  const opacity = useTransform(progress, at, [first ? 1 : 0, 1, 1, last ? 1 : 0]);
  const y = useTransform(progress, at, [first ? 0 : 40, 0, 0, last ? 0 : -40]);
  const scale = useTransform(progress, at, [first ? 1 : 0.94, 1, 1, last ? 1 : 0.96]);
  const blur = useTransform(progress, at, [first ? 0 : 8, 0, 0, last ? 0 : 6]);
  const filter = useTransform(blur, (v) => `blur(${v}px)`);
  return (
    <motion.div style={{ opacity, y, scale, filter }} inert={!active} aria-hidden={!active || undefined} className={`absolute inset-0 flex items-center ${active ? "" : "pointer-events-none"}`}>
      <div className="w-full">{children}</div>
    </motion.div>
  );
}

/** A caption's progress rail: fills top to bottom over its third of the scroll. */
function Fill({ progress, from, to }: { progress: MotionValue<number>; from: number; to: number }) {
  const scaleY = useTransform(progress, [from, to], [0, 1]);
  return <motion.span style={{ scaleY, transformOrigin: "50% 0%" }} className="absolute inset-0 rounded-full bg-ink" />;
}
