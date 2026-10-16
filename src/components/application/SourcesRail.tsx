"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { useMotion } from "../ui";
import { KIND_LABEL } from "./trace";
import { scrollInside, useTrace } from "./useTrace";

// The inspector's list of sources: every fact the open document cites, numbered by first
// use, as fact slips (a mono number in a pill, the fact, "used in N lines"). Selecting a slip
// draws the highlighter over every line that cites it and scrolls its first marker into view;
// selecting a marker selects its slip and scrolls the rail only. It shows what the kit cites
// and nothing else: no invented relevance or confidence.

export function SourcesRail({ what }: { what: string }) {
  const { numbers, uses, facts, active, from, select, railRef } = useTrace();
  const { reduce } = useMotion();
  const listRef = useRef<HTMLOListElement>(null);
  const ids = [...numbers.keys()];

  // Keep the two sides in step.
  useEffect(() => {
    if (!active) return;
    const sel = `[data-${from === "marker" ? "slip" : "marker"}="${CSS.escape(active)}"]`;
    if (from === "marker") scrollInside(railRef.current, listRef.current?.querySelector(sel) ?? null);
    else document.querySelector(sel)?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [active, from, railRef, reduce]);

  if (!ids.length) return null;

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
    <nav aria-labelledby="sources-title" className="grid gap-3">
      <div>
        <h2 id="sources-title" className="text-body font-semibold text-ink">
          Sources
        </h2>
        <p className="text-caption text-ink-3">
          Where {what} came from: <span className="num">{ids.length}</span> {ids.length === 1 ? "fact" : "facts"} you confirmed. Pick one to see its lines.
        </p>
      </div>
      <ol ref={listRef} onKeyDown={onKey} className="grid gap-1.5">
        {ids.map((id) => {
          const f = facts.get(id);
          if (!f) return null;
          const n = numbers.get(id)!;
          const used = uses.get(id) ?? 0;
          const isOn = active === id;
          return (
            <li key={id}>
              <button
                type="button"
                data-slip={id}
                aria-pressed={isOn}
                tabIndex={id === tabStop ? 0 : -1}
                onClick={() => select(id, "slip")}
                className={`grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 rounded-field border px-3 py-2.5 text-left transition-[background-color,border-color] duration-150 ${
                  isOn ? "border-transparent bg-pop-soft" : "border-line bg-surface hover:border-control-border"
                }`}
              >
                <span aria-hidden className={`mt-px grid h-5 min-w-6 place-items-center rounded-full px-1 font-mono text-[11px] font-semibold transition-colors duration-150 ${isOn ? "bg-pop text-pop-ink" : "bg-pop-soft text-ink"}`}>
                  {n}
                </span>
                <span className="min-w-0">
                  <span className="sr-only">Source {n}: </span>
                  <span className="block text-body leading-snug text-ink">{f.text}</span>
                  <span className="mt-1 block text-caption text-ink-3">
                    {[KIND_LABEL[f.kind], f.org].filter(Boolean).join(", ")}. Used in <span className="num">{used}</span> {used === 1 ? "line" : "lines"}
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
