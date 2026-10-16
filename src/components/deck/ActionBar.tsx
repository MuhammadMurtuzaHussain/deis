"use client";

import { ArrowArcLeft, BookmarkSimple, Check, X } from "@phosphor-icons/react";
import { IconButton, Kbd } from "../ui";
import type { Dir } from "./logic";

// The round buttons under the card: Undo 44, Skip 56, Later 48, Apply 64. On phones the bar
// is fixed above the bottom nav, so Apply is never under it (UX-4); from lg it sits in the flow.
// Each button has a visible word under it as well as its accessible name.

export function ActionBar({ onDecide, onUndo, canUndo, disabled }: { onDecide: (dir: Dir) => void; onUndo: () => void; canUndo: boolean; disabled: boolean }) {
  const item = "grid justify-items-center gap-1";
  const word = "text-caption text-ink-2";
  return (
    <div className="fixed inset-x-0 bottom-(--mobile-nav) z-20 border-t border-line bg-surface/95 px-4 pt-2 pb-2 backdrop-blur lg:static lg:z-auto lg:mt-5 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
      <div role="group" aria-label="Decide on this job" className="mx-auto flex max-w-md items-end justify-center gap-5 sm:gap-7">
        <div className={item}>
          <IconButton label="Undo" size={44} variant="ghost" onClick={onUndo} disabled={!canUndo} aria-keyshortcuts="Z Backspace" className="border border-control-border bg-raised">
            <ArrowArcLeft size={20} aria-hidden />
          </IconButton>
          <span aria-hidden className={word}>
            Undo
          </span>
        </div>
        <div className={item}>
          <IconButton label="Skip" size={56} onClick={() => onDecide("skip")} disabled={disabled} aria-keyshortcuts="ArrowLeft">
            <X size={26} weight="bold" aria-hidden />
          </IconButton>
          <span aria-hidden className={word}>
            Skip
          </span>
        </div>
        <div className={item}>
          <IconButton label="Later" size={48} onClick={() => onDecide("save")} disabled={disabled} aria-keyshortcuts="ArrowUp" className="text-ochre">
            <BookmarkSimple size={22} weight="bold" aria-hidden />
          </IconButton>
          <span aria-hidden className={word}>
            Later
          </span>
        </div>
        <div className={item}>
          <IconButton label="Apply" size={64} variant="primary" onClick={() => onDecide("apply")} disabled={disabled} aria-keyshortcuts="ArrowRight">
            <Check size={30} weight="bold" aria-hidden />
          </IconButton>
          <span aria-hidden className={`${word} font-bold text-ink`}>
            Apply
          </span>
        </div>
      </div>
    </div>
  );
}

/** The keys, for pointer and keyboard users on larger screens. */
export function KeyHint() {
  return (
    <p className="mt-4 hidden flex-wrap items-center justify-center gap-x-3 gap-y-1 text-caption text-ink-3 lg:flex">
      <span>Drag the card, or use the keys:</span>
      <span>
        <Kbd>→</Kbd> apply
      </span>
      <span>
        <Kbd>←</Kbd> skip
      </span>
      <span>
        <Kbd>↑</Kbd> later
      </span>
      <span>
        <Kbd>Z</Kbd> undo
      </span>
    </p>
  );
}
