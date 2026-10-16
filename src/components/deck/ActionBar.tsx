"use client";

import { ArrowArcLeft, BookmarkSimple, Check, X } from "@phosphor-icons/react";
import { createPortal } from "react-dom";
import { IconButton, RollingNumber } from "../ui";
import type { Dir } from "./logic";

// The round buttons under the card: Undo 44 (ghost), Skip 60, Later 52, Apply 72 (lime, the
// only lime on the screen). On phones the bar is fixed above the tab bar, so Apply is never
// under it (UX-4); from lg it sits in the flow under the card. Each button has a visible word
// under it as well as its accessible name. The phone bar is portalled to <body>, so the route's
// rise-in transform never moves it off the bottom edge.

type Props = { onDecide: (dir: Dir) => void; onUndo: () => void; canUndo: boolean; disabled: boolean };

export function ActionBar(props: Props) {
  return (
    <>
      <div className="mt-2 hidden lg:block">
        <Buttons {...props} />
      </div>
      {typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-x-0 bottom-(--mobile-nav) z-20 border-t border-line bg-bg/90 px-4 pt-2.5 pb-2 backdrop-blur-md lg:hidden">
            <Buttons {...props} />
          </div>,
          document.body,
        )}
    </>
  );
}

function Buttons({ onDecide, onUndo, canUndo, disabled }: Props) {
  const item = "grid justify-items-center gap-1.5";
  const word = "text-[12px] font-medium text-ink-3";
  return (
    <div>
      <div role="group" aria-label="Decide on this job" className="mx-auto flex max-w-[460px] items-end justify-center gap-5 sm:gap-7">
        <div className={item}>
          <IconButton label="Undo" size={44} variant="ghost" onClick={onUndo} disabled={!canUndo} aria-keyshortcuts="Z Backspace">
            <ArrowArcLeft size={20} weight="bold" aria-hidden />
          </IconButton>
          <span aria-hidden className={word}>
            Undo
          </span>
        </div>
        <div className={item}>
          <IconButton label="Skip" size={60} onClick={() => onDecide("skip")} disabled={disabled} aria-keyshortcuts="ArrowLeft">
            <X size={26} weight="bold" aria-hidden />
          </IconButton>
          <span aria-hidden className={word}>
            Skip
          </span>
        </div>
        <div className={item}>
          <IconButton label="Later" size={52} onClick={() => onDecide("save")} disabled={disabled} aria-keyshortcuts="ArrowUp">
            <BookmarkSimple size={22} weight="bold" aria-hidden />
          </IconButton>
          <span aria-hidden className={word}>
            Later
          </span>
        </div>
        <div className={item}>
          <IconButton label="Apply" size={72} variant="primary" onClick={() => onDecide("apply")} disabled={disabled} aria-keyshortcuts="ArrowRight">
            <Check size={32} weight="bold" aria-hidden />
          </IconButton>
          <span aria-hidden className={`${word} text-ink`}>
            Apply
          </span>
        </div>
      </div>
    </div>
  );
}

/** The keys, for pointer and keyboard users on larger screens, with where this card sits. */
export function KeyHint({ position }: { position: { n: number; total: number } | null }) {
  return (
    <p aria-hidden className="mt-4 hidden flex-wrap items-center justify-center gap-x-4 gap-y-1 font-mono text-[12px] text-ink-3 lg:flex">
      {position && (
        <span className="text-ink-2">
          <RollingNumber value={position.n} /> / <RollingNumber value={position.total} />
        </span>
      )}
      <span>← skip</span>
      <span>↑ later</span>
      <span>→ apply</span>
      <span>Z undo</span>
    </p>
  );
}
