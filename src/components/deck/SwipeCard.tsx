"use client";

import { motion, useMotionValue, useTransform, type MotionValue, type PanInfo, type TargetAndTransition } from "motion/react";
import type { ReactNode } from "react";
import { MOTION, useMotion } from "../ui";
import { release, SWIPE, type Dir } from "./logic";
import type { Flow, Intent } from "./useSwipeDeck";

// One card in the stack. The top card (depth 0) drags sideways: right applies, left skips.
// The card under it (depth 1) is the real next job at scale .96, rising as you drag.
// touch-action pan-y keeps vertical page scroll working on phones (UX-4); "Later" is the
// Up arrow or its button, so the gesture never fights the scroll.

const OFF = 560;

/** Where a card goes when it leaves, and where an undone card comes back from. */
function offscreen(dir: Dir, reduce: boolean): TargetAndTransition {
  if (reduce) return { opacity: 0 };
  if (dir === "save") return { y: -OFF, opacity: 0 };
  return { x: dir === "apply" ? OFF : -OFF, opacity: 1 };
}

export function SwipeCard({
  id,
  depth,
  intent,
  flow,
  label,
  onTrack,
  onRelease,
  children,
}: {
  id: string;
  depth: 0 | 1;
  intent: Intent;
  flow: Flow;
  /** "<title> at <company>", for the hidden card underneath. */
  label: string;
  onTrack: (dx: number) => void;
  /** A drag let go: a decision, or null to snap back. */
  onRelease: (dir: Dir | null) => void;
  children: ReactNode;
}) {
  const { reduce, t } = useMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], reduce ? [0, 0, 0] : [-8, 0, 8]);
  // Stamps follow the card itself, so they also show while a button or key sends it away.
  const apply = useTransform(x, [8, SWIPE.threshold], [0, 1]);
  const skip = useTransform(x, [-SWIPE.threshold, -8], [1, 0]);
  const later = useTransform(y, [-SWIPE.threshold * 1.6, -8], [1, 0]);

  const top = depth === 0;
  // The card underneath rises with the drag: scale .96 → 1 and y 12 → 0 over the notches.
  const commit = top ? 0 : intent.step / SWIPE.steps;
  const rest: TargetAndTransition = reduce ? { opacity: 1 } : { x: 0, scale: top ? 1 : 0.96 + commit * 0.04, y: top ? 0 : 12 - commit * 12, opacity: 1 };

  const variants = {
    // A card that comes back by Undo flies in from the side it left; a new card under the stack fades up.
    enter: (f: Flow) => (f?.kind === "undo" && f.id === id ? offscreen(f.dir, reduce) : reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 24 }),
    // Only the card that was decided flies; one pushed down the stack by an Undo just fades.
    exit: (f: Flow) => ({ ...(f?.kind === "decide" && f.id === id ? offscreen(f.dir, reduce) : { opacity: 0 }), transition: t(MOTION.exit) }),
  };

  const onDrag = (_: unknown, info: PanInfo) => onTrack(info.offset.x);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    onTrack(0);
    onRelease(release(info.offset.x, info.velocity.x));
  };

  return (
    <motion.div
      custom={flow}
      variants={variants}
      initial="enter"
      animate={rest}
      exit="exit"
      transition={t(MOTION.spring)}
      // x and y on both depths, so the card underneath rises into place without a jump when it becomes the top.
      style={{ x, y, rotate, zIndex: top ? 2 : 1, touchAction: "pan-y", transformOrigin: "50% 100%" }}
      drag={top ? "x" : false}
      dragDirectionLock
      dragElastic={1}
      dragConstraints={{ left: 0, right: 0 }}
      whileDrag={reduce ? undefined : { scale: 1.03, boxShadow: "var(--shadow-lift)" }}
      onDrag={top ? onDrag : undefined}
      onDragEnd={top ? onDragEnd : undefined}
      // The card underneath is decoration until it's on top.
      inert={!top}
      aria-hidden={top ? undefined : true}
      aria-label={top ? undefined : label}
      className={`absolute inset-0 rounded-card ${top ? "cursor-grab active:cursor-grabbing" : "pointer-events-none border border-line bg-raised shadow-card"}`}
    >
      {/* The card underneath shows as a blank edge until a drag lifts it, so the stack doesn't read as clutter. */}
      <motion.div className="h-full" initial={false} animate={{ opacity: top ? 1 : commit }} transition={t(MOTION.trace)}>
        {children}
      </motion.div>
      {top && (
        <>
          <Stamp className="left-6 border-accent text-accent-text" value={apply}>
            Apply
          </Stamp>
          <Stamp className="right-6 border-ink text-ink" value={skip}>
            Skip
          </Stamp>
          <Stamp className="inset-x-0 mx-auto w-fit border-ochre text-ochre" value={later}>
            Later
          </Stamp>
        </>
      )}
    </motion.div>
  );
}

/** A rubber stamp over the card, rotated −8°, visible as far as the drag has gone. */
function Stamp({ className, value, children }: { className: string; value: MotionValue<number>; children: ReactNode }) {
  return (
    <motion.span
      aria-hidden
      style={{ opacity: value, rotate: -8 }}
      className={`display pointer-events-none absolute top-8 rounded-control border-[3px] bg-raised/90 px-3 py-0.5 text-[26px] tracking-wide uppercase ${className}`}
    >
      {children}
    </motion.span>
  );
}
