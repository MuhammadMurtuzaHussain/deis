"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { quantise, SWIPE, type Dir } from "./logic";

// The deck's gesture state, after the Swipe Deck pattern (docs/DESIGN.md "Motion"):
// - intent: drag progress in notches (0..steps), which raises the card underneath;
// - flow: which way the last card left or came back, so exits and undos fly the right way;
// - keys: Right applies, Left skips, Up keeps for later, Z or Backspace undoes, Escape clears.
// Losing focus (another window, a hidden tab) drops a half-made drag intent.

export type Intent = { dir: -1 | 0 | 1; step: number };
export type Flow = { dir: Dir; kind: "decide" | "undo"; id: string } | null;

const NONE: Intent = { dir: 0, step: 0 };

export function useSwipeDeck({ onKey, enabled }: { onKey: (action: Dir | "undo") => void; enabled: boolean }) {
  const [intent, setIntent] = useState<Intent>(NONE);
  const [flow, setFlow] = useState<Flow>(null);
  const last = useRef<Intent>(NONE);

  /** Called on every drag frame; only re-renders when the notch changes. */
  const track = useCallback((dx: number) => {
    const q = quantise(dx);
    if (q.dir === last.current.dir && q.step === last.current.step) return;
    last.current = q;
    setIntent(q);
  }, []);

  const clear = useCallback(() => {
    last.current = NONE;
    setIntent(NONE);
  }, []);

  useEffect(() => {
    const onBlur = () => clear();
    const onVisible = () => document.visibilityState === "hidden" && clear();
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [clear]);

  // Window-wide, as before the redesign, but never while typing, in a dialog or with a modifier held.
  const keyRef = useRef(onKey);
  useEffect(() => {
    keyRef.current = onKey;
  }, [onKey]);
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t?.closest("input, textarea, select, [contenteditable], [role=dialog], [role=tablist]")) return;
      if (document.querySelector("[role=dialog][aria-modal=true]")) return;
      let action: Dir | "undo" | null = null;
      if (e.key === "ArrowRight") action = "apply";
      else if (e.key === "ArrowLeft") action = "skip";
      else if (e.key === "ArrowUp") action = "save";
      else if (e.key === "Backspace" || e.key.toLowerCase() === "z") action = "undo";
      else if (e.key === "Escape") return clear();
      if (!action) return;
      e.preventDefault();
      keyRef.current(action);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, clear]);

  return { intent, track, clear, flow, setFlow, steps: SWIPE.steps };
}
