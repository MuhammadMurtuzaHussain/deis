"use client";

import { STAGES, STAGE_LABEL, type Stage } from "./logic";

// The pipeline at a glance: Saved, Ready, Applied, Follow up, Closed, each a Newsreader
// count. Each is also a filter for the list below (press again to show everything).

export function PipelineStrip({ counts, filter, onFilter }: { counts: Record<Stage, number>; filter: Stage | null; onFilter: (s: Stage | null) => void }) {
  return (
    <div role="group" aria-label="Filter by stage" className="grid grid-cols-5 gap-1.5 sm:gap-2">
      {STAGES.map((s) => {
        const on = filter === s;
        const due = s === "followup" && counts[s] > 0;
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            onClick={() => onFilter(on ? null : s)}
            className={`relative grid min-h-11 justify-items-start gap-0.5 overflow-hidden rounded-control border bg-raised px-2.5 py-2 text-left sm:rounded-surface sm:px-4 sm:py-3 transition-colors hover:bg-wash ${on ? "border-ink shadow-[inset_0_0_0_1px_var(--ink)]" : "border-line"}`}
          >
            {due && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-ochre" />}
            <span className="display num text-lead text-ink sm:text-title">{counts[s]}</span>
            <span className={`text-caption leading-tight ${due ? "font-bold text-ochre" : "text-ink-2"}`}>{STAGE_LABEL[s]}</span>
          </button>
        );
      })}
    </div>
  );
}
