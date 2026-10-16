"use client";

import { Check, Copy, DownloadSimple, Highlighter, Printer } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import type { Kit } from "@/lib/client/db";
import { cvText } from "@/lib/cv/compose";
import { Button, toast } from "../ui";
import { download } from "./copy";
import { letterText } from "./LetterView";
import { useTrace } from "./useTrace";

// The sticky bar above the paper: download, print, copy and "Highlight sources", which draws
// the highlighter over every traced line at once. The Word writer (docx, about 125 KB
// gzipped) loads only when a download is asked for (CH-11).

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          toast("Couldn't copy. Select the text and copy it yourself.");
        }
      }}
    >
      {done ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      {done ? "Copied" : label}
    </Button>
  );
}

/** A pill toggle: off is a ghost button, on wears the highlighter (pop-soft), never lime text. */
function HighlightToggle() {
  const { all, setAll } = useTrace();
  return (
    <button
      type="button"
      aria-pressed={all}
      onClick={() => setAll(!all)}
      className={`ml-auto inline-flex h-9 shrink-0 items-center gap-2 rounded-pill border px-4 text-body font-medium whitespace-nowrap transition-[background-color,border-color,color] active:scale-[0.98] pointer-coarse:h-11 ${
        all ? "border-transparent bg-pop-soft text-ink" : "border-line text-ink-2 hover:bg-sunken hover:text-ink"
      }`}
    >
      <Highlighter size={16} weight={all ? "fill" : "regular"} aria-hidden />
      Highlight sources
    </button>
  );
}

function Bar({ children }: { children: ReactNode }) {
  return (
    <div data-print-hidden className="sticky top-(--top-bar) z-10 -mx-1 flex flex-wrap items-center gap-1.5 bg-bg/90 px-1 py-2 backdrop-blur-md">
      {children}
    </div>
  );
}

/** job: company and title for the file name; name: whose CV it is. */
export function CvToolbar({ kit, job, name }: { kit: Kit; job: { company: string; title: string }; name: string }) {
  const header = kit.cv.header;
  const [busy, setBusy] = useState(false);
  return (
    <Bar>
      <Button
        size="sm"
        busy={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const { cvDocx, cvFileName, toBlob } = await import("@/lib/cv/docx");
            download(await toBlob(cvDocx(kit.cv, header)), cvFileName(job.company, job.title, name));
          } catch {
            toast("The Word file couldn't be made. Try again, or use Save as PDF.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {!busy && <DownloadSimple size={16} aria-hidden />}
        Download Word
      </Button>
      <Button size="sm" onClick={() => window.print()}>
        <Printer size={16} aria-hidden />
        Save as PDF
      </Button>
      <CopyButton text={cvText(kit.cv, header)} label="Copy text" />
      <HighlightToggle />
    </Bar>
  );
}

export function LetterToolbar({ kit, job, name }: { kit: Kit; job: { company: string; title: string }; name: string }) {
  const [busy, setBusy] = useState(false);
  if (!kit.letter) return null;
  const letter = kit.letter;
  return (
    <Bar>
      <Button
        size="sm"
        busy={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const { letterDocx, letterFileName, toBlob } = await import("@/lib/cv/docx");
            download(await toBlob(letterDocx(letter, kit.cv.header, job.title)), letterFileName(job.company, job.title, name));
          } catch {
            toast("The Word file couldn't be made. Try again, or copy the text.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {!busy && <DownloadSimple size={16} aria-hidden />}
        Download Word
      </Button>
      <CopyButton text={letterText(letter, name)} label="Copy text" />
      <HighlightToggle />
    </Bar>
  );
}
