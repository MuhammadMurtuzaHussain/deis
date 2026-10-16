"use client";

import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { getMeta, setMeta, type Application, type Kit } from "@/lib/client/db";
import { cvSections, scrub } from "@/lib/cv/compose";
import { IconButton, RollingNumber } from "../ui";
import { tracedLines } from "./trace";

// "The kit writes itself" (MAGIC moment 2). The first time a finished kit is shown, or when a
// new one lands while you watch, the CV sheet assembles: sections slide in, each line wipes
// in (12 to 25 ms apart, 1.8 s at most), its markers pop, and the check row counts the
// traced lines up while the sentences the guard removed flash struck through and collapse.
// A per-application "revealed" flag (the kit's timestamp, in meta) makes later visits
// instant; Replay plays it again. Under reduced motion nothing plays.

const CAP = 1.8;
const LINE = 0.26;
const SHOW = 6;

export type RevealPlan = { run: number; step: number };

const Ctx = createContext<RevealPlan | null>(null);
/** The running reveal, or null when the sheet should show as it is. */
export const useReveal = () => useContext(Ctx);

/** Every row the sheet reveals one by one: section headings, entry headings, lines and skill lists. */
export function revealRows(kit: Kit): number {
  let n = 1;
  for (const s of cvSections(kit.cv)) {
    if (s.id === "header") continue;
    n += 1 + (s.paragraph?.length ? 1 : 0) + (s.bullets?.length ?? 0) + (s.lists?.length ?? 0);
    for (const e of s.entries ?? []) n += 1 + e.lines.length;
  }
  return n;
}

const stepFor = (rows: number) => Math.min(0.025, Math.max(0.012, CAP / Math.max(1, rows)));

type Phase = "check" | "play" | "still";

/** The reveal's state for one application: whether to play, the plan, and replay. */
export function useKitReveal(app: Application | null | undefined) {
  const reduce = Boolean(useReducedMotion());
  const id = app?.id;
  const kit = app?.kit ?? null;
  const at = kit?.at;
  const [phase, setPhase] = useState<Phase>("check");
  const [run, setRun] = useState(0);
  const rows = useMemo(() => (kit ? revealRows(kit) : 0), [kit]);
  const step = stepFor(rows);

  // Play once per kit: the flag holds the timestamp of the kit last revealed.
  useEffect(() => {
    if (!id || !at) return;
    let off = false;
    void getMeta<number | null>(`revealed.${id}`, null).then((seen) => {
      if (off) return;
      if (seen === at || reduce) setPhase("still");
      else {
        setRun((r) => r + 1);
        setPhase("play");
      }
      if (seen !== at) void setMeta(`revealed.${id}`, at);
    });
    return () => {
      off = true;
    };
  }, [id, at, reduce]);

  // The sheet is done after its last line has wiped in.
  const total = rows * step + LINE + 0.3;
  // The check row's ticker needs a moment per removed sentence it shows.
  const span = Math.max(total, Math.min(SHOW, kit?.events.length ?? 0) * 0.32);
  useEffect(() => {
    if (phase !== "play") return;
    const t = setTimeout(() => setPhase("still"), span * 1000 + 100);
    return () => clearTimeout(t);
  }, [phase, run, span]);

  const replay = useCallback(() => {
    if (reduce) return;
    setRun((r) => r + 1);
    setPhase("play");
  }, [reduce]);

  const plan = phase === "play" ? { run, step } : null;
  return { plan, hidden: phase === "check" && Boolean(at), playing: phase === "play", run, total, replay, canReplay: !reduce };
}

export function RevealProvider({ plan, children }: { plan: RevealPlan | null; children: ReactNode }) {
  return <Ctx.Provider value={plan}>{children}</Ctx.Provider>;
}

/** One row of the sheet: wipes in left to right after `at` seconds while a reveal runs. */
export function Wipe({ at, children, className = "" }: { at: number; children: ReactNode; className?: string }) {
  const plan = useReveal();
  if (!plan) return <span className={`block ${className}`}>{children}</span>;
  return (
    <motion.span
      key={plan.run}
      className={`block ${className}`}
      initial={{ clipPath: "inset(0 100% 0 0)", opacity: 0.3, y: 3 }}
      animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1, y: 0 }}
      transition={{ delay: at, duration: LINE, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.span>
  );
}

/** A list item whose bullet arrives with its line (the text itself wipes in through Wipe). */
export function Item({ at, style, children }: { at: number; style?: CSSProperties; children: ReactNode }) {
  const plan = useReveal();
  if (!plan) return <li style={style}>{children}</li>;
  return (
    <motion.li key={plan.run} style={style} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: at, duration: 0.12 }}>
      {children}
    </motion.li>
  );
}

/** A heading that slides in with its section. */
export function Rise({ at, children }: { at: number; children: ReactNode }) {
  const plan = useReveal();
  if (!plan) return <>{children}</>;
  return (
    <motion.div key={plan.run} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: at, duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

/**
 * "Checked: 23 lines traced, 12 removed" above the sheet. While the kit writes itself the
 * counts roll up and the sentences the guard removed flash past struck through. Replay
 * plays the whole sequence again.
 */
export function CheckRow({ kit, playing, run, total, replay, canReplay }: { kit: Kit; playing: boolean; run: number; total: number; replay: () => void; canReplay: boolean }) {
  const traced = useMemo(() => tracedLines(cvSections(kit.cv)).filter((l) => l.facts.length > 0).length, [kit]);
  const removed = kit.events.length;
  const shown = useMemo(() => kit.events.slice(0, SHOW).map((e) => scrub(e.text)), [kit]);
  const slot = Math.max(total / Math.max(1, shown.length), 0.32);
  const end = Math.max(total, shown.length * slot);
  const [clock, setClock] = useState({ run: -1, s: 0 });

  // While playing, a 50 ms clock drives the counts and the ticker; the numbers roll between ticks.
  useEffect(() => {
    if (!playing) return;
    const t0 = performance.now();
    const timer = setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      setClock({ run, s });
      if (s >= end) clearInterval(timer);
    }, 50);
    return () => clearInterval(timer);
  }, [playing, run, end]);

  const s = !playing ? Infinity : clock.run === run ? clock.s : 0;
  const done = s >= end;
  const flash = done ? -1 : Math.min(shown.length - 1, Math.floor(s / slot));
  const tick = {
    traced: done ? traced : Math.min(traced, Math.round((s / total) * traced)),
    removed: done ? removed : Math.min(removed, Math.round(((flash + 1) / Math.max(1, shown.length)) * removed)),
    flash,
  };

  return (
    <div data-print-hidden className="flex min-h-11 items-center gap-3 rounded-pill border border-line bg-surface py-1 pr-1 pl-4 text-caption">
      <p className="shrink-0 text-ink-2">
        <span className="sr-only">
          Checked: {traced} {traced === 1 ? "line" : "lines"} traced to your facts, {removed} removed.
        </span>
        <span aria-hidden>
          <span className="font-medium text-ink">Checked:</span> <RollingNumber key={`t${run}`} value={tick.traced} className="font-mono text-ink" /> traced,{" "}
          <RollingNumber key={`r${run}`} value={tick.removed} className="font-mono text-ink" /> removed
        </span>
      </p>
      <div aria-hidden className="relative h-5 min-w-0 flex-1 overflow-hidden">
        <AnimatePresence initial={false}>
          {tick.flash >= 0 && (
            <motion.s
              key={`${run}-${tick.flash}`}
              className="absolute inset-0 truncate text-ink-3 decoration-danger"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scaleY: 0.2, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              {shown[tick.flash]}
            </motion.s>
          )}
        </AnimatePresence>
      </div>
      {canReplay && (
        <IconButton label="Replay the check" size={36} variant="ghost" onClick={replay} disabled={playing}>
          <ArrowCounterClockwise size={16} aria-hidden />
        </IconButton>
      )}
    </div>
  );
}
