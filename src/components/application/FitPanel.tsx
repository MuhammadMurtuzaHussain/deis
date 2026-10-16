"use client";

import { ArrowsLeftRight, CheckCircle, CircleDashed } from "@phosphor-icons/react";
import type { Application } from "@/lib/client/db";
import { useStore } from "@/lib/client/store";
import { readRightToWork, workFit, WORK_FIT_COPY, WORK_STATUS_LABEL } from "@/lib/jobs/rightToWork";
import type { Fact } from "@/lib/profile/types";
import { Elapsed, Pill, Skeleton } from "../ui";
import { VERDICT } from "./copy";

// The inspector's fit block: Gemma's verdict, the must-haves matched to your facts (with
// fact text, never ids), and right to work as code reads it.

const MATCH = {
  strong: { Icon: CheckCircle, weight: "fill" as const, cls: "text-accent", sr: "Strong match" },
  transferable: { Icon: ArrowsLeftRight, weight: "regular" as const, cls: "text-ink-2", sr: "Carries over" },
  gap: { Icon: CircleDashed, weight: "regular" as const, cls: "text-ochre", sr: "Gap" },
};

export function FitPanel({ app, facts, numbers, pending }: { app: Application; facts: Map<string, Fact>; numbers: Map<string, number>; pending: { since: number | null; waiting: boolean; error: string | null } | null }) {
  const fit = app.fit;
  if (!fit) {
    return (
      <div className="grid gap-2">
        <p className="text-caption text-ink-3">How you fit</p>
        {pending?.error ? (
          <p className="text-body text-ink-2">Not checked yet.</p>
        ) : pending ? (
          <>
            <p className="text-body text-ink-2">
              Gemma is comparing the posting to your facts. {pending.since ? <Elapsed since={pending.since} /> : pending.waiting ? "Waiting its turn." : null}
            </p>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </>
        ) : (
          <p className="text-body text-ink-2">Not checked yet.</p>
        )}
      </div>
    );
  }
  const count = (m: keyof typeof MATCH) => fit.requirements.filter((r) => r.match === m).length;
  const strong = count("strong");
  const carries = count("transferable");
  const gaps = count("gap");
  return (
    <div className="grid gap-4">
      <div>
        <p className="text-caption text-ink-3">How you fit</p>
        <p className="display mt-1 text-title text-ink">{VERDICT[fit.verdict] ?? fit.verdict}</p>
        {fit.angle && <p className="mt-1 text-body text-ink-2">{fit.angle}</p>}
        {/* Counted by code from the requirements, not Gemma's own score. */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {strong > 0 && <Pill tone="go">{strong} strong</Pill>}
          {carries > 0 && <Pill>{carries} carry over</Pill>}
          {gaps > 0 && <Pill tone="ochre">{gaps === 1 ? "1 gap" : `${gaps} gaps`}</Pill>}
        </div>
      </div>
      <ul className="grid gap-3 border-t border-line pt-4">
        {fit.requirements.map((r, i) => {
          const m = MATCH[r.match];
          const from = r.facts.map((id) => facts.get(id)).filter((f): f is Fact => Boolean(f));
          return (
            <li key={i} className="flex items-start gap-2.5">
              <m.Icon size={20} weight={m.weight} aria-hidden className={`mt-0.5 shrink-0 ${m.cls}`} />
              <div className="min-w-0 text-body">
                <span className="sr-only">{m.sr}: </span>
                <span className="font-medium text-ink">{r.need}</span>
                {r.note && <p className="text-ink-2">{r.note}</p>}
                {from.length > 0 && (
                  <ul className="mt-1 grid gap-0.5 text-caption text-ink-3">
                    {from.map((f) => (
                      <li key={f.id} className="flex gap-1.5">
                        {numbers.has(f.id) ? (
                          <span className="font-mono text-trace" aria-label={`Source ${numbers.get(f.id)}`}>
                            {numbers.get(f.id)}
                          </span>
                        ) : (
                          <span aria-hidden>·</span>
                        )}
                        <span className="min-w-0">{f.text}</span>
                      </li>
                    ))}
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

const WORK_BOX = { ok: "bg-surface border border-line before:bg-ink-3", check: "bg-ochre-soft before:bg-ochre", blocked: "bg-brick-soft before:bg-brick" };

/** Right to work, from code: what the posting says (quoted) and what it means for the user's own status. */
export function WorkLine({ description }: { description: string }) {
  const { profile } = useStore();
  const rtw = readRightToWork(description);
  if (rtw.stance === "unknown") return null;
  const status = profile?.preferences.workStatus ?? null;
  const fit = workFit(rtw.stance, status);
  const meaning =
    fit === "blocked" ? "This rules out your status, so think twice before applying." : fit === "check" ? "Check this fits your situation before you apply." : status ? "That fits your status." : "Set your status in Profile and Deis will check this for you.";
  return (
    <div className={`relative overflow-hidden rounded-control py-3 pr-4 pl-4 text-body before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${WORK_BOX[fit]}`}>
      <p className="text-caption text-ink-3">Right to work</p>
      <p className="mt-0.5 font-medium text-ink">
        {WORK_FIT_COPY[rtw.stance]}. {meaning}
      </p>
      {rtw.evidence && (
        <p className="mt-1 text-caption text-ink-2">
          The posting says: <q>{rtw.evidence}</q>
        </p>
      )}
      {status && <p className="mt-1 text-caption text-ink-2">Your status: {WORK_STATUS_LABEL[status]}. Deis checks this with code; it isn&apos;t immigration advice.</p>}
    </div>
  );
}
