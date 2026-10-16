"use client";

import { ArrowsClockwise, Question } from "@phosphor-icons/react";
import type { Application } from "@/lib/client/db";
import { savedOn } from "@/lib/client/offline";
import type { Fact } from "@/lib/profile/types";
import { Button, Surface } from "../ui";
import { FitPanel, WorkLine } from "./FitPanel";
import type { KitTab } from "./KitView";
import { Notes } from "./Notes";
import { SourcesRail } from "./SourcesRail";
import { useTrace } from "./useTrace";

// The right-hand column of the kit workspace: verdict and requirements, right to work, the
// checks in one line, where each line came from, this kit's details and the notes. Sticky on
// desktop with its own scroll; a section under the paper on phones.

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
  return (
    <aside ref={railRef} aria-label="About this application" className="grid min-w-0 content-start gap-4 lg:sticky lg:top-6 lg:-mx-1 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:overscroll-contain lg:px-1 lg:pb-1">
      <Surface raised className="p-5">
        <FitPanel app={app} facts={facts} numbers={numbers} pending={fitPending} />
      </Surface>
      <WorkLine description={app.job.description} />

      {kit && tab !== "checks" && (
        <Surface className="flex items-center justify-between gap-3 p-4">
          <p className="min-w-0 text-body text-ink">
            <span className="block text-caption text-ink-3">Checks</span>
            {n ? `Deis removed ${n} ${n === 1 ? "thing" : "things"} your facts don't back up.` : "Nothing needed removing."}
          </p>
          <Button size="sm" variant="ghost" onClick={() => onTab("checks")}>
            See checks
          </Button>
        </Surface>
      )}

      {kit && tab !== "checks" && numbers.size > 0 && (
        <Surface className="p-4">
          <SourcesRail what={WHAT[tab]} />
        </Surface>
      )}

      {kit && (
        <Surface className="grid gap-3 p-4">
          <div>
            <p className="text-caption text-ink-3">This kit</p>
            <p className="text-body text-ink-2">
              Written by {kit.model} on {savedOn(kit.at, true)}, in <span className="num">{Math.round(kit.usage.ms / 1000)}</span> s with{" "}
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
                Answer gap questions first
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
