"use client";

import { useState } from "react";
import { ArrowsLeftRight, Check, CircleDashed, Prohibit, Question, ShieldCheck } from "@phosphor-icons/react";
import type { Application } from "@/lib/client/db";
import { useStore } from "@/lib/client/store";
import { readRightToWork, workFit, WORK_FIT_COPY, WORK_STATUS_LABEL } from "@/lib/jobs/rightToWork";
import type { Fact } from "@/lib/profile/types";
import { Chip, Elapsed, Skeleton } from "../ui";
import { VERDICT } from "./copy";
import { useTraceMaybe } from "./useTrace";

// The inspector's fit block: Gemma's verdict, the must-haves matched to your facts (with
// fact text, never ids), and right to work as code reads it. Each match sits in a small
// round chip: strong on pop-soft (proven), carries over on sunken, a gap on warn-soft.
// Lime is never an icon colour on white. The counts above the list are toggle chips that
// filter it to one group; "All" or a second press on the same chip shows every requirement.

const MATCH = {
  strong: { Icon: Check, weight: "bold" as const, chip: "bg-pop-soft text-ink", sr: "Strong match", group: "strong matches", label: (n: number) => `${n} strong` },
  transferable: { Icon: ArrowsLeftRight, weight: "bold" as const, chip: "bg-sunken text-ink-2", sr: "Carries over", group: "carry over", label: (n: number) => `${n} carry over` },
  gap: { Icon: CircleDashed, weight: "bold" as const, chip: "bg-warn-soft text-warn", sr: "Gap", group: "gaps", label: (n: number) => (n === 1 ? "1 gap" : `${n} gaps`) },
};
type Match = keyof typeof MATCH;
const GROUPS: Match[] = ["strong", "transferable", "gap"];

export function FitPanel({ app, facts, numbers, pending }: { app: Application; facts: Map<string, Fact>; numbers: Map<string, number>; pending: { since: number | null; waiting: boolean; error: string | null } | null }) {
  const trace = useTraceMaybe();
  const [show, setShow] = useState<Match | "all">("all");
  const fit = app.fit;
  if (!fit) {
    return (
      <div className="grid gap-2">
        <h2 className="text-caption text-ink-3">How you fit</h2>
        {pending?.error ? (
          <p className="text-body text-ink-2">Not checked yet.</p>
        ) : pending ? (
          <>
            <p className="text-body text-ink-2">
              Gemma is comparing the posting to your facts. {pending.since ? <Elapsed since={pending.since} /> : pending.waiting ? "Waiting its turn." : null}
            </p>
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </>
        ) : (
          <p className="text-body text-ink-2">Not checked yet.</p>
        )}
      </div>
    );
  }
  const counts = new Map(GROUPS.map((m) => [m, fit.requirements.filter((r) => r.match === m).length]));
  const groups = GROUPS.filter((m) => counts.get(m));
  // A group that empties after a rewrite falls back to all.
  const shown = show !== "all" && groups.includes(show) ? show : "all";
  const visible = fit.requirements.map((r, i) => ({ r, i })).filter(({ r }) => shown === "all" || r.match === shown);
  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-caption text-ink-3">How you fit</h2>
        <p className="display mt-1 text-title leading-tight text-ink">{VERDICT[fit.verdict] ?? fit.verdict}</p>
        {fit.angle && <p className="mt-1.5 text-body text-ink-2">{fit.angle}</p>}
        {/* Counted by code from the requirements, not Gemma's own score. */}
        {groups.length > 0 && (
          <div role="group" aria-label="Show requirements" className="mt-3 flex flex-wrap gap-1.5">
            <Chip on={shown === "all"} onClick={() => setShow("all")}>
              All {fit.requirements.length}
            </Chip>
            {groups.map((m) => (
              <Chip key={m} on={shown === m} onClick={() => setShow(shown === m ? "all" : m)}>
                {MATCH[m].label(counts.get(m) ?? 0)}
              </Chip>
            ))}
          </div>
        )}
      </div>
      <ul aria-label={shown === "all" ? "Requirements" : `Requirements: ${MATCH[shown].group}`} className="grid gap-3.5 border-t border-line pt-4">
        {visible.map(({ r, i }) => {
          const m = MATCH[r.match];
          const from = r.facts.map((id) => facts.get(id)).filter((f): f is Fact => Boolean(f));
          return (
            <li key={i} className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3">
              <span aria-hidden className={`mt-px grid size-6 place-items-center rounded-full ${m.chip}`}>
                <m.Icon size={13} weight={m.weight} />
              </span>
              <div className="min-w-0 text-body">
                <span className="sr-only">{m.sr}: </span>
                <span className="font-medium text-ink">{r.need}</span>
                {r.note && <p className="mt-0.5 text-ink-2">{r.note}</p>}
                {from.length > 0 && (
                  <ul className="mt-1.5 grid gap-1 text-caption text-ink-3">
                    {from.map((f) => {
                      const n = numbers.get(f.id);
                      return (
                        <li key={f.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2">
                          {n && trace ? (
                            <button
                              type="button"
                              aria-pressed={trace.active === f.id}
                              onClick={() => trace.select(f.id, "slip")}
                              className={`grid h-5 min-w-6 place-items-center rounded-full px-1 font-mono text-[11px] font-semibold transition-colors ${trace.active === f.id ? "bg-pop text-pop-ink" : "bg-pop-soft text-ink hover:shadow-[inset_0_0_0_1px_var(--control-border)]"}`}
                            >
                              {n}
                              <span className="sr-only">: show the lines citing {f.text}</span>
                            </button>
                          ) : (
                            <span aria-hidden className="w-6" />
                          )}
                          <span className="min-w-0 pt-px">{f.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const WORK = {
  ok: { box: "border border-line bg-surface", icon: "text-ink-2", Icon: ShieldCheck },
  check: { box: "bg-warn-soft", icon: "text-warn", Icon: Question },
  blocked: { box: "bg-danger-soft", icon: "text-danger", Icon: Prohibit },
};

/** Right to work, from code: what the posting says (quoted) and what it means for the user's own status. */
export function WorkLine({ description }: { description: string }) {
  const { profile } = useStore();
  const rtw = readRightToWork(description);
  if (rtw.stance === "unknown") return null;
  const status = profile?.preferences.workStatus ?? null;
  const fit = workFit(rtw.stance, status);
  const w = WORK[fit];
  const meaning =
    fit === "blocked" ? "This rules out your status, so think twice before applying." : fit === "check" ? "Check this fits your situation before you apply." : status ? "That fits your status." : "Set your status in Profile and Deis will check this for you.";
  return (
    <section aria-label="Right to work" className={`flex gap-3 rounded-panel px-4 py-3.5 text-body ${w.box}`}>
      <w.Icon size={20} weight="fill" aria-hidden className={`mt-0.5 shrink-0 ${w.icon}`} />
      <div className="min-w-0">
        <p className="text-caption text-ink-2">Right to work</p>
        <p className="mt-0.5 font-medium text-ink">
          {WORK_FIT_COPY[rtw.stance]}. {meaning}
        </p>
        {rtw.evidence && <p className="mt-1.5 font-mono text-[12px] leading-relaxed text-ink-2">The posting says &ldquo;{rtw.evidence}&rdquo;</p>}
        {status && <p className="mt-1.5 text-caption text-ink-2">Your status: {WORK_STATUS_LABEL[status]}. Deis checks this with code; it isn&apos;t immigration advice.</p>}
      </div>
    </section>
  );
}
