"use client";

import { RollingNumber } from "../ui";
import { STAGES, STAGE_LABEL, type Stage } from "./logic";

// The pipeline at a glance: Saved, Ready, Applied, Follow up, Closed as one strip of big
// Bricolage counts that roll when they change. Each is also a filter for the list below (press
// again to show everything). The selected stage is ink, Follow up with anything in it warn.

export function PipelineStrip({ counts, filter, onFilter }: { counts: Record<Stage, number>; filter: Stage | null; onFilter: (s: Stage | null) => void }) {
  return (
    <div role="group" aria-label="Filter by stage" className="grid grid-cols-5 gap-1 rounded-panel border border-line bg-surface p-1">
      {STAGES.map((s) => {
        const on = filter === s;
        const due = s === "followup" && counts[s] > 0;
        const empty = counts[s] === 0;
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            onClick={() => onFilter(on ? null : s)}
            className={`grid min-h-11 content-between justify-items-start gap-2 rounded-[16px] px-2.5 py-2.5 text-left transition-[background-color,color,transform] active:scale-[0.97] sm:px-4 sm:py-3.5 ${
              on ? "bg-ink text-surface" : due ? "bg-warn-soft text-warn hover:brightness-[0.98]" : "hover:bg-sunken"
            }`}
          >
            <span className={`display text-[28px] leading-none sm:text-[40px] ${on ? "" : due ? "" : empty ? "text-ink-3" : "text-ink"}`}>
              <RollingNumber value={counts[s]} />
            </span>
            <span className={`text-caption leading-tight ${on ? "text-surface/80" : due ? "font-semibold" : "text-ink-2"}`}>{STAGE_LABEL[s]}</span>
          </button>
        );
      })}
    </div>
  );
}
