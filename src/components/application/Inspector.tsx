"use client";

import { ArrowsClockwise, CaretRight, Question } from "@phosphor-icons/react";
import type { Application } from "@/lib/client/db";
import { savedOn } from "@/lib/client/offline";
import type { Fact } from "@/lib/profile/types";
import { Button, Surface } from "../ui";
import { FitPanel, WorkLine } from "./FitPanel";
import type { KitTab } from "./KitView";
import { Notes } from "./Notes";
import { SourcesRail } from "./SourcesRail";
import { useTrace } from "./useTrace";

// The right-hand column of the kit workspace, 360 wide: the verdict and requirements, right to
// work, the sources (fact slips), the checks in one line, this kit's details and the notes.
// Sticky under the top bar on desktop with its own scroll; a section under the paper on phones.

const WHAT: Record<KitTab, string> = { cv: "this CV", letter: "this letter", answers: "these answers", checks: "this kit" };

export function Inspector({
  app,
  facts,
  tab,
  onTab,
  fitPending,
  rebuild,
}: {
  app: Application;
  facts: Map<string, Fact>;
  tab: KitTab;
  onTab: (t: KitTab) => void;
  fitPending: { since: number | null; waiting: boolean; error: string | null } | null;
  rebuild: { canRewrite: boolean; busy: boolean; again: () => void; careful: () => void } | null;
}) {
  const { railRef, numbers } = useTrace();
  const kit = app.kit;
  const n = kit?.events.length ?? 0;
  const sources = Boolean(kit) && tab !== "checks" && numbers.size > 0;
  return (
    <aside
      ref={railRef}
      aria-label="About this application"
      className="grid min-w-0 content-start gap-3 lg:sticky lg:top-[calc(var(--top-bar)+1.5rem)] lg:-mx-1 lg:max-h-[calc(100dvh-var(--top-bar)-3rem)] lg:overflow-y-auto lg:overscroll-contain lg:px-1 lg:pb-1"
    >
      <Surface raised className="p-5">
        <FitPanel app={app} facts={facts} numbers={numbers} pending={fitPending} />
      </Surface>
      <WorkLine description={app.job.description} />

      {sources && (
        <Surface className="p-4">
          <SourcesRail what={WHAT[tab]} />
        </Surface>
      )}

      {kit && tab !== "checks" && (
        <button
          type="button"
          onClick={() => onTab("checks")}
          className="group flex items-center gap-3 rounded-panel border border-line bg-surface px-4 py-3.5 text-left transition-colors hover:border-control-border"
        >
          <span className="num grid size-9 shrink-0 place-items-center rounded-full bg-sunken font-mono text-[13px] font-semibold text-ink">{n}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-body font-medium text-ink">See checks</span>
            <span className="block text-caption text-ink-2">{n ? `Deis removed ${n} ${n === 1 ? "thing" : "things"} your facts don't back up.` : "Nothing needed removing."}</span>
          </span>
          <CaretRight size={16} aria-hidden className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
        </button>
      )}

      {kit && (
        <Surface className="grid gap-3 p-4">
          <div>
            <h2 className="text-caption text-ink-3">This kit</h2>
            <p className="mt-0.5 text-body text-ink-2">
              Written by <span className="font-mono text-[13px] text-ink">{kit.model}</span> on {savedOn(kit.at, true)}, in <span className="num">{Math.round(kit.usage.ms / 1000)}</span> s with{" "}
              <span className="num">{(kit.usage.inputTokens + kit.usage.outputTokens).toLocaleString("en-IE")}</span> tokens.
            </p>
          </div>
          {rebuild?.canRewrite && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={rebuild.again} disabled={rebuild.busy}>
                <ArrowsClockwise size={16} aria-hidden />
                Write it again
              </Button>
              <Button size="sm" variant="ghost" onClick={rebuild.careful} disabled={rebuild.busy}>
                <Question size={16} aria-hidden />
                Answer gap questions
              </Button>
            </div>
          )}
        </Surface>
      )}

      <Surface className="p-4">
        <Notes app={app} />
      </Surface>
    </aside>
  );
}
