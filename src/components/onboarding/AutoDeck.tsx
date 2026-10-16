"use client";

import { Pause, Play } from "@phosphor-icons/react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { quantise, type Dir } from "../deck/logic";
import { SwipeCard } from "../deck/SwipeCard";
import type { Flow, Intent } from "../deck/useSwipeDeck";
import { JobCard } from "../JobCard";
import { IconButton, useMotion } from "../ui";
import { SAMPLES, WriteLine } from "./Story";

// Welcome's hero picture: the real deck, playing itself. Every 2.6 s the top sample card is
// applied, skipped or kept for later with the deck's own throw physics, and each Apply writes
// its CV line underneath, traced and highlighted. It pauses on hover, on focus, off screen and
// with the Pause button (WCAG 2.2.2); you can also drag a card yourself. Reduced motion: a
// static card and one traced line, no auto-play.

const EVERY = 2600;
const NONE: Intent = { dir: 0, step: 0 };

export function AutoDeck() {
  const { reduce } = useMotion();
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { amount: 0.4 });
  const [n, setN] = useState(0);
  const [flow, setFlow] = useState<Flow>(null);
  const [intent, setIntent] = useState<Intent>(NONE);
  const [hover, setHover] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [line, setLine] = useState({ key: -1, ...SAMPLES[0].cv });

  const at = (i: number) => SAMPLES[i % SAMPLES.length];
  const keyOf = (i: number) => `${at(i).job.id}-${i}`;

  // The top card's index, for the timer and drags (state updaters must stay pure).
  const top = useRef(0);
  const decide = useCallback((dir: Dir) => {
    const i = top.current;
    const s = SAMPLES[i % SAMPLES.length];
    setFlow({ dir, kind: "decide", id: `${s.job.id}-${i}` });
    if (dir === "apply" && s.cv.text) setLine({ key: i, ...s.cv });
    top.current = i + 1;
    setN(i + 1);
    setIntent(NONE);
  }, []);

  const playing = !reduce && !hover && !stopped && inView;
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => decide(SAMPLES[top.current % SAMPLES.length].dir), EVERY);
    return () => clearInterval(timer);
  }, [playing, decide]);

  if (reduce) {
    return (
      <div className="grid gap-3">
        <JobCard job={SAMPLES[0].job} work="ok" why={SAMPLES[0].why} preview />
        <WriteLine fact={SAMPLES[0].cv.fact} text={SAMPLES[0].cv.text} />
      </div>
    );
  }

  return (
    <div className="grid gap-3" onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <div ref={box} className="relative mb-6 h-[452px]">
        <AnimatePresence custom={flow} initial={false}>
          {[0, 1, 2]
            .map((d) => {
              const s = at(n + d);
              return (
                <SwipeCard
                  key={keyOf(n + d)}
                  id={keyOf(n + d)}
                  depth={d as 0 | 1 | 2}
                  intent={intent}
                  flow={flow}
                  label={`${s.job.title} at ${s.job.company}`}
                  onTrack={(dx) => setIntent(quantise(dx))}
                  onRelease={(dir) => {
                    if (dir) decide(dir);
                    else setIntent(NONE);
                  }}
                >
                  <JobCard job={s.job} work="ok" why={s.why} preview active={d === 0} />
                </SwipeCard>
              );
            })
            .reverse()}
        </AnimatePresence>
      </div>
      <div className="relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={line.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
            <WriteLine fact={line.fact} text={line.text} />
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="font-mono text-[12px] text-ink-3">Swipe right, and this line lands on your CV.</p>
        <IconButton label={stopped ? "Play the sample deck" : "Pause the sample deck"} size={36} variant="ghost" onClick={() => setStopped((s) => !s)}>
          {stopped ? <Play size={16} weight="fill" aria-hidden /> : <Pause size={16} weight="fill" aria-hidden />}
        </IconButton>
      </div>
    </div>
  );
}
