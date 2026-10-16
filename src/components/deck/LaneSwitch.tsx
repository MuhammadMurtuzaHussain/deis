"use client";

import { Lightning, Path } from "@phosphor-icons/react";
import { useLiveQuery } from "dexie-react-hooks";
import { LayoutGroup, motion } from "motion/react";
import type { Lane } from "@/lib/ai/prompts";
import { db, setMeta } from "@/lib/client/db";
import { MOTION, useMotion } from "../ui";

/** The saved lane, live: the top bar's switch and the deck read the same row. Null until the person picks one. */
export function useLane(): Lane | null {
  return useLiveQuery(async () => ((await db.meta.get("lane"))?.value as Lane | undefined) ?? null, [], null);
}

const LANES = [
  { id: "quick", label: "Quick", Icon: Lightning, hint: "Quick: the kit is written in the background while you keep swiping" },
  { id: "careful", label: "Careful", Icon: Path, hint: "Careful: see the fit and answer questions about your gaps before the kit is written" },
] as const;

/** Quick or Careful, as a segmented pill like the main nav: what happens after you apply. */
export function LaneSwitch({ className = "" }: { className?: string }) {
  const lane = useLane();
  const { t } = useMotion();
  return (
    <LayoutGroup id={`lane-${className}`}>
      <div role="radiogroup" aria-label="After you apply" className={`items-center gap-0.5 rounded-pill bg-sunken p-1 ${className || "flex"}`}>
        {LANES.map(({ id, label, Icon, hint }) => {
          const on = lane === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              title={hint}
              onClick={() => void setMeta("lane", id)}
              className={`relative inline-flex h-8 items-center gap-1.5 rounded-pill px-3 text-caption font-medium transition-colors pointer-coarse:h-10 ${on ? "text-surface" : "text-ink-2 hover:text-ink"}`}
            >
              {on && <motion.span aria-hidden layoutId="lane-indicator" transition={t(MOTION.indicator)} className="absolute inset-0 rounded-pill bg-ink" />}
              <Icon size={14} weight={on ? "fill" : "bold"} aria-hidden className="relative" />
              <span className="relative">{label}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
