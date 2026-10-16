"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Fact } from "@/lib/profile/types";

// Which fact is selected, shared by the CV's gutter markers and the inspector's fact slips.
// Selecting either side draws the highlighter over every line that cites it (UX-2). "Highlight
// sources" draws it over every traced line at once. Markers always show on screen; never in print.

export type TraceFrom = "marker" | "slip";

type Trace = {
  /** "Highlight sources": every traced line carries the highlighter, not just the selected fact's. */
  all: boolean;
  setAll: (all: boolean) => void;
  /** Fact id to its number (1, 2, 3 by first use on the page). */
  numbers: Map<string, number>;
  /** How many lines cite each fact. */
  uses: Map<string, number>;
  facts: Map<string, Fact>;
  active: string | null;
  from: TraceFrom | null;
  select: (id: string | null, from: TraceFrom) => void;
  /** The inspector's own scroll box, so a slip scrolls into view there and never moves the page. */
  railRef: RefObject<HTMLDivElement | null>;
};

const Ctx = createContext<Trace | null>(null);

export function useTrace(): Trace {
  const t = useContext(Ctx);
  if (!t) throw new Error("useTrace outside TraceProvider");
  return t;
}

/** The trace state, or null outside a TraceProvider (the print copy). */
export const useTraceMaybe = () => useContext(Ctx);

export function TraceProvider({ numbers, uses, facts, children }: { numbers: Map<string, number>; uses: Map<string, number>; facts: Map<string, Fact>; children: ReactNode }) {
  const [all, setAll] = useState(false);
  const [sel, setSel] = useState<{ id: string | null; from: TraceFrom | null }>({ id: null, from: null });
  const railRef = useRef<HTMLDivElement | null>(null);
  // Selecting the selected fact again clears it.
  const select = useCallback((id: string | null, from: TraceFrom) => setSel((s) => (s.id === id ? { id: null, from } : { id, from })), []);
  const value = useMemo(() => ({ all, setAll, numbers, uses, facts, active: sel.id, from: sel.from, select, railRef }), [all, numbers, uses, facts, sel, select]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Scroll el into view inside box only (never the page), with a little room above. */
export function scrollInside(box: HTMLElement | null, el: Element | null) {
  if (!box || !el || box.scrollHeight <= box.clientHeight + 1) return;
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.top < b.top + 8) box.scrollTop -= b.top + 8 - r.top;
  else if (r.bottom > b.bottom - 8) box.scrollTop += r.bottom - (b.bottom - 8);
}
