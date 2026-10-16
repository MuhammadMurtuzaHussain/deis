"use client";

import type { Answers } from "@/lib/cv/schema";
import { Marked, Markers, useLine } from "./CvSheet";
import { CopyButton } from "./Toolbar";

// Form answers: one panel each, a copy button, and the sources each answer cites. The answer
// text takes the highlighter like a CV line does.

export function AnswersView({ answers }: { answers: Answers }) {
  const line = useLine();
  if (!answers.answers.length) return <p className="text-body text-ink-2">The posting didn&apos;t need any form answers.</p>;
  return (
    <ul className="grid gap-3">
      {answers.answers.map((a, i) => {
        const l = line(a.facts);
        return (
          <li key={i} className="grid gap-2 rounded-panel border border-line bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="pt-1.5 text-body font-semibold text-ink">{a.question}</h3>
              {a.answer && <CopyButton text={a.answer} label="Copy" />}
            </div>
            {a.answer ? (
              <p className="max-w-[65ch] text-body text-ink-2">
                <Marked on={l.on} lit={l.lit}>
                  <span className={l.on ? "text-ink" : undefined}>{a.answer}</span>
                </Marked>
              </p>
            ) : (
              <p className="text-caption text-ink-3">Only you can answer this one.</p>
            )}
            {l.count > 0 && (
              <div className="mt-1 flex items-center gap-2 text-caption text-ink-3">
                <span>Sources</span>
                <Markers facts={a.facts} ui />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
