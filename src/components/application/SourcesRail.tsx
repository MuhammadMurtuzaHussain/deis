"use client";

import { motion } from "motion/react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { MOTION, Pill, useMotion } from "../ui";
import { KIND_LABEL } from "./trace";
import { scrollInside, useTrace } from "./useTrace";

// The inspector's list of sources: every fact the open document cites, numbered by first
// use, as paper slips. Selecting a slip lights every line that cites it and scrolls its
// first marker into view; selecting a marker lights its slip and scrolls the rail only.
// It shows what the kit cites and nothing else: no invented relevance or confidence.

export function SourcesRail({ what }: { what: string }) {
  const { numbers, uses, facts, active, from, select, railRef, on } = useTrace();
  const { reduce, t } = useMotion();
  const listRef = useRef<HTMLOListElement>(null);
  const ids = [...numbers.keys()];

  // Keep the two sides in step.
  useEffect(() => {
    if (!active) return;
    const sel = `[data-${from === "marker" ? "slip" : "marker"}="${CSS.escape(active)}"]`;
    if (from === "marker") scrollInside(railRef.current, listRef.current?.querySelector(sel) ?? null);
    else document.querySelector(sel)?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [active, from, railRef, reduce]);

  if (!on || !ids.length) return null;

  // Up, Down, Home and End move focus between slips (one tab stop for the list).
  const onKey = (e: KeyboardEvent<HTMLOListElement>) => {
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-slip]") ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const next = e.key === "ArrowDown" ? Math.min(at + 1, buttons.length - 1) : e.key === "ArrowUp" ? Math.max(at - 1, 0) : e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    buttons.forEach((b, i) => (b.tabIndex = i === next ? 0 : -1));
    buttons[next].focus();
  };
  const tabStop = active && numbers.has(active) ? active : ids[0];

  return (
    <nav aria-label="Sources" className="grid gap-2">
      <p className="text-caption text-ink-3">
        Where {what} came from: {ids.length} {ids.length === 1 ? "fact" : "facts"} you confirmed
      </p>
      <ol ref={listRef} onKeyDown={onKey} className="grid gap-2">
        {ids.map((id) => {
          const f = facts.get(id);
          if (!f) return null;
          const n = numbers.get(id)!;
          const used = uses.get(id) ?? 0;
          const isOn = active === id;
          return (
            <li key={id} className="relative">
              {isOn && <motion.span layoutId={reduce ? undefined : "slip-bar"} transition={t(MOTION.trace)} aria-hidden className="absolute inset-y-0 left-0 z-10 w-[3px] rounded-l-control bg-trace" />}
              <button
                type="button"
                data-slip={id}
                aria-current={isOn ? "true" : undefined}
                tabIndex={id === tabStop ? 0 : -1}
                onClick={() => select(id, "slip")}
                className={`grid w-full grid-cols-[24px_minmax(0,1fr)] gap-x-2.5 rounded-control border px-3 py-2.5 text-left transition-colors duration-150 ${isOn ? "border-trace bg-trace-soft" : "border-line bg-raised hover:border-control-border"}`}
              >
                <span aria-hidden className={`mt-0.5 grid h-5 w-6 place-items-center rounded-full font-mono text-[11px] font-bold ${isOn ? "bg-trace text-raised" : "border border-trace/50 bg-trace-soft text-trace"}`}>
                  {n}
                </span>
                <span className="min-w-0">
                  <span className="sr-only">Source {n}: </span>
                  <span className="block text-body text-ink">{f.text}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-2">
                    <span>{[KIND_LABEL[f.kind], f.org].filter(Boolean).join(", ")}</span>
                    <span aria-hidden>·</span>
                    <span>{used === 1 ? "Used in 1 line" : `Used in ${used} lines`}</span>
                    {isOn && <Pill>Selected</Pill>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
