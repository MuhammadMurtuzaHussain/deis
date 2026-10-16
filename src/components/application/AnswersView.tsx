"use client";

import type { Answers } from "@/lib/cv/schema";
import { Markers, useLine } from "./CvSheet";
import { CopyButton } from "./Toolbar";

// Form answers: one card each, a copy button, and the sources each answer cites.

export function AnswersView({ answers }: { answers: Answers }) {
  const line = useLine();
  if (!answers.answers.length) return <p className="text-body text-ink-2">The posting didn&apos;t need any form answers.</p>;
  return (
    <ul className="grid gap-3">
      {answers.answers.map((a, i) => {
        const l = line(a.facts);
        return (
          <li key={i} className={`rounded-surface border p-5 transition-colors duration-150 ${l.lit ? "border-trace bg-trace-soft" : "border-line bg-raised"}`}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-body font-bold text-ink">{a.question}</h3>
              {a.answer && <CopyButton text={a.answer} label="Copy" />}
            </div>
            {a.answer ? <p className="mt-2 text-body text-ink-2">{a.answer}</p> : <p className="mt-2 text-caption text-ink-3">Only you can answer this one.</p>}
            {l.count > 0 && (
              <div className="mt-3 flex items-center gap-2 text-caption text-ink-3">
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
