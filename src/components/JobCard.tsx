"use client";

import { ArrowsLeftRight, CheckCircle, CircleDashed, IdentificationBadge, MapPin, Robot, Translate } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useId, useState } from "react";
import type { CardCache } from "@/lib/client/db";
import { WORK_FIT_COPY, type WorkFit } from "@/lib/jobs/rightToWork";
import type { ScoredJob } from "@/lib/jobs/types";
import { fitPill } from "./deck/logic";
import { MOTION, Pill, Skeleton, useMotion, type PillTone } from "./ui";

// One job, as an index card. Everything above "How you match" is worked out by code and
// quoted from the posting; the "how you match" lines are Gemma's, and each one that claims
// a match points at facts from the user's profile. The fit pill is counted from those
// guarded lines by code, never Gemma's own score.

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

// "Early career" is a neutral pill (green means go, nothing else).
const LEVEL: Record<ScoredJob["seniority"]["level"], { label: string; tone: PillTone }> = {
  early: { label: "Early career", tone: "neutral" },
  open: { label: "No level stated", tone: "neutral" },
  stretch: { label: "Stretch", tone: "ochre" },
  senior: { label: "Senior", tone: "brick" },
};

export function LevelBadge({ job }: { job: ScoredJob }) {
  const l = LEVEL[job.seniority.level];
  return <Pill tone={l.tone}>{l.label}</Pill>;
}

const WHY_ICON = {
  strong: { Icon: CheckCircle, weight: "fill" as const, cls: "text-accent", label: "Strong match:" },
  transferable: { Icon: ArrowsLeftRight, weight: "regular" as const, cls: "text-ink-2", label: "Carries over:" },
  gap: { Icon: CircleDashed, weight: "regular" as const, cls: "text-ochre", label: "Gap:" },
};

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
  /** A static sample (Welcome): no posting link, no animation. */
  preview?: boolean;
}) {
  const [showInjection, setShowInjection] = useState(false);
  const { reduce, t } = useMotion();
  const matchId = useId();
  const posted = job.source === "pasted" ? "Added by you" : postedAgo(job.postedAt);
  const fit = fitPill(why?.why);
  const animate = !preview && !reduce;

  return (
    <article aria-label={`${job.title} at ${job.company}`} className="flex h-full flex-col overflow-y-auto overscroll-contain rounded-card border border-line bg-raised p-5 shadow-card sm:p-6 dark:border-control-border/60">
      <div className="flex items-baseline justify-between gap-4">
        <p className="smallcaps min-w-0 truncate text-ink-2">{job.company}</p>
        {posted && <p className="shrink-0 text-caption text-ink-3">{posted}</p>}
      </div>
      <h2 className="display mt-1.5 text-[24px] leading-[1.15] text-ink text-balance sm:text-[28px]">{job.title}</h2>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <MapPin size={18} aria-hidden className="shrink-0" />
          {job.remote && job.city !== "Remote (Ireland)" ? `${job.city}, remote possible` : job.city}
        </span>
        {job.salary && <span className="display num text-lead text-ink">{job.salary}</span>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <LevelBadge job={job} />
        {fit && <Pill tone={fit.tone}>{fit.label}</Pill>}
      </div>

      {job.seniority.evidence && (
        <blockquote className="mt-3 border-l border-control-border pl-3 text-caption text-ink-2">
          <q className="[quotes:none]">{job.seniority.evidence}</q>
        </blockquote>
      )}

      <div className="mt-3 grid gap-1.5">
        {job.rightToWork.stance !== "unknown" && (
          <p className={`flex items-start gap-2 text-caption ${work === "check" ? "text-ochre" : "text-ink-2"}`}>
            <IdentificationBadge size={18} className="mt-px shrink-0" aria-hidden />
            <span>
              {WORK_FIT_COPY[job.rightToWork.stance]}
              {work === "check" && ". Check this fits your stamp."}
            </span>
          </p>
        )}
        {job.languages.length > 0 && (
          <p className="flex items-center gap-2 text-caption text-ink-2">
            <Translate size={18} aria-hidden className="shrink-0" />
            Needs {job.languages.map((l) => l.join(" or ")).join(" and ")}
          </p>
        )}
      </div>

      <section aria-labelledby={matchId} className="mt-4 border-t border-line pt-3" aria-live="polite">
        <h3 id={matchId} className="mb-2 text-caption text-ink-3">
          How you match
        </h3>
        {why ? (
          <ul className="grid gap-2">
            {why.why.map((w, i) => {
              const k = WHY_ICON[w.kind];
              return (
                <motion.li
                  key={`${why.at}-${i}`}
                  initial={animate ? { opacity: 0, y: 6 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={t({ ...MOTION.trace, delay: i * MOTION.stagger })}
                  className="flex items-start gap-2.5 text-body"
                >
                  <k.Icon size={20} weight={k.weight} className={`mt-0.5 shrink-0 ${k.cls}`} aria-label={k.label} />
                  <span>{w.text}</span>
                </motion.li>
              );
            })}
          </ul>
        ) : whyError ? (
          <p className="text-body text-ink-2">{whyError}</p>
        ) : (
          <div className="grid gap-2.5">
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
            <p className="text-caption text-ink-3">Gemma is reading this one</p>
          </div>
        )}
      </section>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-4">
        {job.injections.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowInjection((s) => !s)}
            aria-expanded={showInjection}
            className="-mx-1 inline-flex min-h-11 items-center gap-1.5 rounded-control px-1 text-left text-caption text-ochre underline-offset-2 hover:underline"
          >
            <Robot size={18} aria-hidden className="shrink-0" />
            This posting talks to AI tools. Deis ignored it.
          </button>
        ) : (
          <span />
        )}
        {onDetails && !preview && (
          <button type="button" onClick={onDetails} className="link -mx-1 inline-flex min-h-11 items-center rounded-control px-1 text-caption font-medium">
            Read the full posting
          </button>
        )}
      </div>
      {showInjection && (
        <ul className="mt-2 grid gap-2 rounded-control bg-ochre-soft p-3 text-caption text-ink">
          {job.injections.map((s, i) => (
            <li key={i}>
              <q>{s}</q>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
