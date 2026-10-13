"use client";

import { ArrowsLeftRight, CheckCircle, CircleDashed, IdentificationBadge, MapPin, Robot, Translate } from "@phosphor-icons/react";
import { useState } from "react";
import type { CardCache } from "@/lib/client/db";
import { WORK_FIT_COPY, type WorkFit } from "@/lib/jobs/rightToWork";
import type { ScoredJob } from "@/lib/jobs/types";

// One job, as a card. Everything above the "why" lines is worked out by code and
// quoted from the posting; the three "why" lines are Gemma's, and each one that
// claims a match points at facts from the user's profile.

export function postedAgo(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (Number.isNaN(days)) return null;
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 30) return `Posted ${days} days ago`;
  const months = Math.round(days / 30);
  return `Posted ${months} month${months > 1 ? "s" : ""} ago`;
}

const LEVEL: Record<ScoredJob["seniority"]["level"], { label: string; cls: string }> = {
  early: { label: "Early career", cls: "bg-accent-soft text-accent-text" },
  open: { label: "No level stated", cls: "bg-surface-2 text-ink-2" },
  stretch: { label: "Stretch", cls: "bg-amber-soft text-amber" },
  senior: { label: "Senior", cls: "bg-brick-soft text-brick" },
};

export function LevelBadge({ job }: { job: ScoredJob }) {
  const l = LEVEL[job.seniority.level];
  return <span className={`inline-flex items-center rounded-control px-2.5 py-1 text-sm font-medium ${l.cls}`}>{l.label}</span>;
}

export function JobCard({
  job,
  work,
  why,
  whyError,
  onDetails,
  preview,
}: {
  job: ScoredJob;
  work: WorkFit;
  why: CardCache | null;
  whyError?: string | null;
  onDetails?: () => void;
  preview?: boolean;
}) {
  const [showInjection, setShowInjection] = useState(false);
  const posted = postedAgo(job.postedAt);
  return (
    <article aria-label={`${job.title} at ${job.company}`} className="flex h-full flex-col rounded-card border border-line bg-surface p-6 shadow-lift">
      <div className="flex items-start justify-between gap-4">
        <p className="font-bold text-ink-2">{job.company}</p>
        {posted && <p className="shrink-0 text-sm text-ink-3">{posted}</p>}
      </div>
      <h2 className="mt-2 text-2xl font-bold leading-tight text-balance">{job.title}</h2>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px] text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <MapPin size={18} aria-hidden />
          {job.remote && job.city !== "Remote (Ireland)" ? `${job.city}, remote possible` : job.city}
        </span>
        {job.salary && <span className="num">{job.salary}</span>}
      </div>

      <div className="mt-4 grid gap-2">
        <div className="flex flex-wrap items-start gap-2">
          <LevelBadge job={job} />
          {job.seniority.evidence && <q className="mt-1 text-sm text-ink-2 [quotes:none]">{job.seniority.evidence}</q>}
        </div>
        {job.rightToWork.stance !== "unknown" && (
          <p className={`flex items-start gap-2 text-sm ${work === "check" ? "text-amber" : "text-ink-2"}`}>
            <IdentificationBadge size={18} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              {WORK_FIT_COPY[job.rightToWork.stance]}
              {work === "check" && ". Check this fits your stamp."}
            </span>
          </p>
        )}
        {job.languages.length > 0 && (
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <Translate size={18} aria-hidden />
            Needs {job.languages.map((l) => l.join(" or ")).join(" and ")}
          </p>
        )}
      </div>

      <div className="mt-5 border-t border-line pt-4" aria-live="polite">
        <h3 className="sr-only">How you match</h3>
        {why ? (
          <ul className="grid gap-2.5">
            {why.why.map((w, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[15px]">
                {w.kind === "strong" ? (
                  <CheckCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-accent" aria-label="Strong match:" />
                ) : w.kind === "transferable" ? (
                  <ArrowsLeftRight size={20} className="mt-0.5 shrink-0 text-ink-2" aria-label="Carries over:" />
                ) : (
                  <CircleDashed size={20} className="mt-0.5 shrink-0 text-amber" aria-label="Gap:" />
                )}
                <span>{w.text}</span>
              </li>
            ))}
          </ul>
        ) : whyError ? (
          <p className="text-sm text-ink-2">{whyError}</p>
        ) : (
          <div className="grid gap-3" aria-label="Gemma is reading this posting">
            <div className="skeleton h-4 w-11/12" />
            <div className="skeleton h-4 w-4/5" />
            <div className="skeleton h-4 w-2/3" />
            <p className="text-sm text-ink-3">Gemma is reading this one</p>
          </div>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
        {job.injections.length > 0 ? (
          <button type="button" onClick={() => setShowInjection((s) => !s)} aria-expanded={showInjection} className="inline-flex items-center gap-1.5 text-left text-sm text-amber underline-offset-2 hover:underline">
            <Robot size={18} aria-hidden />
            This posting talks to AI tools. Deis ignored it.
          </button>
        ) : (
          <span />
        )}
        {onDetails && !preview && (
          <button type="button" onClick={onDetails} className="text-sm font-medium text-accent-text underline-offset-2 hover:underline">
            Read the full posting
          </button>
        )}
      </div>
      {showInjection && (
        <ul className="mt-3 grid gap-2 rounded-control bg-amber-soft p-3 text-sm">
          {job.injections.map((t, i) => (
            <li key={i}>
              <q>{t}</q>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
