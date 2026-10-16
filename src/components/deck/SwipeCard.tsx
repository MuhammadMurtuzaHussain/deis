"use client";

import { motion, useMotionValue, useSpring, useTransform, type MotionValue, type PanInfo, type TargetAndTransition, type Transition } from "motion/react";
import { useRef, type PointerEvent, type ReactNode } from "react";
import { MOTION, useMotion } from "../ui";
import { release, SWIPE, type Dir } from "./logic";
import type { Flow, Intent } from "./useSwipeDeck";

// One card in the stack, as a physical object (docs/DESIGN.md "Motion").
// - The top card (depth 0) tilts in 3D towards a fine pointer (±6°, springs) with a soft
//   spotlight following it; a drag throws it with its real velocity: right applies, left skips.
// - The two cards behind (depth 1 and 2) fan out with depth: smaller, lower, slightly turned.
//   They rise with the drag and spring forward when the top card leaves.
// - Stamps press in (scale 1.4 → 1, a turn) when the drag arms a decision, or when a button or
//   key decides.
// - Apply throws right, Skip tumbles away, Later slides up and shrinks towards the bookmark.
// The drag tilt is `rotate`; the fan and the throws use `rotateZ`, so the two never fight.
// touch-action pan-y keeps vertical page scroll working on phones (UX-4). Under reduced
// motion: no tilt, no throw, opacity only.

const OFF = 620;

/** Where each depth sits at rest: [scale, y, rotate]. */
const FAN: Record<0 | 1 | 2, [number, number, number]> = { 0: [1, 0, 0], 1: [0.955, 16, -1.6], 2: [0.91, 32, 2.2] };

type Throw = { vx: number; vy: number };

/** Where a card goes when it leaves (thrown with its velocity), and where an undone card comes back from. */
function offscreen(dir: Dir, reduce: boolean, thrown: Throw = { vx: 0, vy: 0 }): TargetAndTransition {
  if (reduce) return { opacity: 0, transition: { duration: 0.2 } };
  if (dir === "save") return { y: -OFF, scale: 0.55, rotateZ: 0, opacity: 0, transition: { duration: 0.42, ease: [0.5, 0, 0.75, 0] } };
  if (dir === "skip") {
    // A tumble: off to the left, dropping and turning, fading at the end.
    const extra = Math.min(320, Math.abs(thrown.vx) * 0.18);
    return {
      x: -OFF - extra,
      y: 160 + Math.max(0, thrown.vy * 0.12),
      rotateZ: -34,
      opacity: 0,
      transition: { x: { duration: 0.5, ease: [0.4, 0, 0.9, 0.6] }, y: { duration: 0.5, ease: [0.55, 0, 1, 0.45] }, rotateZ: { duration: 0.5, ease: "easeIn" }, opacity: { duration: 0.2, delay: 0.3 } },
    };
  }
  // Apply: a throw to the right that keeps the release's speed.
  const extra = Math.min(360, Math.abs(thrown.vx) * 0.2);
  return {
    x: OFF + extra,
    y: thrown.vy * 0.15 - 30,
    rotateZ: 14 + Math.min(14, Math.abs(thrown.vx) / 120),
    opacity: 1,
    transition: { x: { type: "spring", stiffness: 90, damping: 18, velocity: Math.max(thrown.vx, 900) }, y: { type: "spring", stiffness: 90, damping: 18 }, rotateZ: { type: "spring", stiffness: 70, damping: 14 } },
  };
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
  depth: 0 | 1 | 2;
  intent: Intent;
  flow: Flow;
  /** "<title> at <company>", for the hidden cards underneath. */
  label: string;
  onTrack: (dx: number) => void;
  /** A drag let go: a decision, or null to snap back. */
  onRelease: (dir: Dir | null) => void;
  children: ReactNode;
}) {
  const { reduce, t } = useMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const dragRotate = useTransform(x, [-220, 0, 220], reduce ? [0, 0, 0] : [-10, 0, 10]);
  const thrown = useRef<Throw>({ vx: 0, vy: 0 });
  const dragging = useRef(false);
  const top = depth === 0;

  // 3D tilt and the spotlight: the pointer's position inside the card, -0.5..0.5 each way.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [6, -6]), { stiffness: 220, damping: 22 });
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-6, 6]), { stiffness: 220, damping: 22 });
  // The spotlight gradient is 200% of the card, so its centre lands under the pointer.
  const spotX = useTransform(px, (v) => `${(0.5 - v) * 100}%`);
  const spotY = useTransform(py, (v) => `${(0.5 - v) * 100}%`);
  const spot = useMotionValue(0);
  const spotOpacity = useSpring(spot, { stiffness: 200, damping: 30 });

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!top || reduce || e.pointerType !== "mouse" || dragging.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
    spot.set(1);
  };
  const settle = () => {
    px.set(0);
    py.set(0);
    spot.set(0);
  };

  // Stamps follow the card itself, so they also show while a button or key sends it away.
  const apply = useTransform(x, [8, SWIPE.threshold], [0, 1]);
  const skip = useTransform(x, [-SWIPE.threshold, -8], [1, 0]);
  const later = useTransform(y, [-SWIPE.threshold * 1.6, -8], [1, 0]);
  // Armed: the drag has gone far enough to decide, or a button or key just decided this card.
  const decided = flow?.kind === "decide" && flow.id === id ? flow.dir : null;
  const armed: Dir | null = top && intent.step >= SWIPE.steps ? (intent.dir > 0 ? "apply" : "skip") : null;

  // The cards underneath rise with the drag, one notch of the fan per full drag.
  const commit = top ? 0 : intent.step / SWIPE.steps;
  const [s0, y0, r0] = FAN[depth];
  const [s1, y1, r1] = FAN[Math.max(0, depth - 1) as 0 | 1 | 2];
  const rest: TargetAndTransition = reduce
    ? { opacity: 1 }
    : { x: 0, scale: s0 + (s1 - s0) * commit, y: y0 + (y1 - y0) * commit, rotateZ: r0 + (r1 - r0) * commit, opacity: 1 };

  const variants = {
    // A card that comes back by Undo flies in from the side it left; a new card joins the back of the fan.
    enter: (f: Flow) => (f?.kind === "undo" && f.id === id ? offscreen(f.dir, reduce) : reduce ? { opacity: 0 } : { opacity: 0, scale: 0.86, y: 52, rotateZ: 0 }),
    // Only the card that was decided flies; one pushed down the stack by an Undo just fades.
    exit: (f: Flow) => (f?.kind === "decide" && f.id === id ? offscreen(f.dir, reduce, thrown.current) : { opacity: 0, transition: t(MOTION.exit) }),
  };

  const onDrag = (_: unknown, info: PanInfo) => onTrack(info.offset.x);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    dragging.current = false;
    onTrack(0);
    thrown.current = { vx: info.velocity.x, vy: info.velocity.y };
    // No decision: the drag constraints spring it back to the middle.
    onRelease(release(info.offset.x, info.velocity.x));
  };

  return (
    <motion.div
      custom={flow}
      variants={variants}
      initial="enter"
      animate={rest}
      exit="exit"
      transition={t(MOTION.spring) as Transition}
      data-deck-top={top ? "" : undefined}
      style={{
        x,
        y,
        ...(top && !reduce ? { rotate: dragRotate, rotateX, rotateY, transformPerspective: 1200 } : {}),
        zIndex: 3 - depth,
        touchAction: "pan-y",
        transformOrigin: "50% 100%",
      }}
      drag={top ? "x" : false}
      dragDirectionLock
      dragElastic={0.9}
      dragConstraints={{ left: 0, right: 0 }}
      dragTransition={{ bounceStiffness: 420, bounceDamping: 26 }}
      whileDrag={reduce ? undefined : { scale: 1.03, boxShadow: "var(--shadow-lift)" }}
      onDragStart={() => {
        dragging.current = true;
        settle();
      }}
      onDrag={top ? onDrag : undefined}
      onDragEnd={top ? onDragEnd : undefined}
      onPointerMove={onPointerMove}
      onPointerLeave={settle}
      // The cards underneath are decoration until they're on top.
      inert={!top}
      aria-hidden={top ? undefined : true}
      aria-label={top ? undefined : label}
      className={`absolute inset-0 rounded-card ${top ? "cursor-grab will-change-transform active:cursor-grabbing" : "pointer-events-none border border-line bg-surface shadow-card"}`}
    >
      {/* The cards underneath show as blank edges until a drag lifts the next one, so the stack doesn't read as clutter. */}
      <motion.div className="h-full" initial={false} animate={{ opacity: top ? 1 : depth === 1 ? commit : 0 }} transition={t(MOTION.trace)}>
        {children}
      </motion.div>
      {top && !reduce && <motion.div aria-hidden className="spotlight pointer-events-none absolute inset-0 rounded-card" style={{ backgroundPositionX: spotX, backgroundPositionY: spotY, opacity: spotOpacity }} />}
      {top && (
        <>
          <Stamp className="left-6 border-pop bg-pop text-pop-ink" value={apply} armed={armed === "apply" || decided === "apply"} reduce={reduce}>
            Apply
          </Stamp>
          <Stamp className="right-6 border-ink bg-surface text-ink" value={skip} armed={armed === "skip" || decided === "skip"} reduce={reduce}>
            Skip
          </Stamp>
          <Stamp className="inset-x-0 mx-auto w-fit border-ink-2 bg-surface text-ink-2" value={later} armed={decided === "save"} reduce={reduce}>
            Later
          </Stamp>
        </>
      )}
    </motion.div>
  );
}

/**
 * A rubber stamp over the card: Bricolage 800 at 28, rotated −10°. It shows faintly as far as
 * the drag has gone, and presses in (scale 1.4 → 1 with a little turn) the moment it arms.
 */
function Stamp({ className, value, armed, reduce, children }: { className: string; value: MotionValue<number>; armed: boolean; reduce: boolean; children: ReactNode }) {
  const faint = useTransform(value, (v) => Math.min(0.5, v * 0.5));
  return (
    <motion.span
      aria-hidden
      style={{ opacity: armed ? 1 : faint }}
      initial={false}
      animate={armed && !reduce ? { scale: [1.4, 0.94, 1], rotate: [-18, -8, -10] } : { scale: 1, rotate: -10 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={`display pointer-events-none absolute top-7 rounded-[12px] border-[3px] px-3.5 pt-0.5 pb-1 text-[28px] leading-none tracking-[0.02em] uppercase shadow-lift ${className}`}
    >
      {children}
    </motion.span>
  );
}
