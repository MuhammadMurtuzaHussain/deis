"use client";

import { ArrowsLeftRight, CaretDown, CheckCircle, CircleDashed, IdentificationBadge, MapPin, Robot, Translate } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useId, useState, type ReactNode } from "react";
import type { CardCache } from "@/lib/client/db";
import type { WorkFit } from "@/lib/jobs/rightToWork";
import type { ScoredJob } from "@/lib/jobs/types";
import { fitPill } from "./deck/logic";
import { CompanyMark, Pill, Skeleton, useMotion, type PillTone } from "./ui";

// One job, as the deck's card (v3). Everything above "How you match" is worked out by code
// and quoted from the posting; the "how you match" lines are Gemma's, and each one that
// claims a match points at facts from the user's profile. The fit pill is counted from
// those guarded lines by code, never Gemma's own score. "Why you're seeing this" (explain)
// is code's reasoning, folded away inside the card.

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

/** "3d", "today", "2mo": the card's compact posted-ago, in mono at the top right. */
function postedShort(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (Number.isNaN(days)) return null;
  if (days <= 0) return "today";
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

// Early career is neutral: lime means go and proven, nothing else.
const LEVEL: Record<ScoredJob["seniority"]["level"], { label: string; tone: PillTone }> = {
  early: { label: "Early career", tone: "neutral" },
  open: { label: "No level stated", tone: "neutral" },
  stretch: { label: "Stretch", tone: "warn" },
  senior: { label: "Senior", tone: "danger" },
};

export function LevelBadge({ job }: { job: ScoredJob }) {
  const l = LEVEL[job.seniority.level];
  return <Pill tone={l.tone}>{l.label}</Pill>;
}

// Each kind of line gets its own glyph on its own tile. Strong is ink on the highlighter
// (never lime on white); a gap is warn.
const WHY = {
  strong: { Icon: CheckCircle, weight: "fill" as const, tile: "bg-pop-soft text-ink", label: "Strong match" },
  transferable: { Icon: ArrowsLeftRight, weight: "bold" as const, tile: "bg-sunken text-ink-2", label: "Carries over" },
  gap: { Icon: CircleDashed, weight: "bold" as const, tile: "bg-warn-soft text-warn", label: "Gap" },
};

export function JobCard({
  job,
  work,
  why,
  whyError,
  onDetails,
  explain,
  preview,
  active = true,
}: {
  job: ScoredJob;
  work: WorkFit;
  why: CardCache | null;
  whyError?: string | null;
  onDetails?: () => void;
  /** "Why you're seeing this": code's reasons, shown in a disclosure. */
  explain?: ReactNode;
  /** A static sample (Welcome): no posting link. */
  preview?: boolean;
  /** The card is on top (the deck) or showing (Welcome): its title words rise in and its match lines reveal. */
  active?: boolean;
}) {
  const [showInjection, setShowInjection] = useState(false);
  const [open, setOpen] = useState(false);
  const { reduce, t } = useMotion();
  const matchId = useId();
  const whyId = useId();
  const posted = job.source === "pasted" ? "pasted" : postedShort(job.postedAt);
  const postedLong = job.source === "pasted" ? "Added by you" : postedAgo(job.postedAt);
  const fit = fitPill(why?.why);
  const animate = !reduce;
  const words = job.title.split(/\s+/).filter(Boolean);
  const place = job.remote && job.city !== "Remote (Ireland)" ? `${job.city}, remote possible` : job.city;

  return (
    <article aria-label={`${job.title} at ${job.company}`} className="flex h-full flex-col overflow-y-auto overscroll-contain rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex items-center gap-3">
        <CompanyMark name={job.company} />
        <p className="min-w-0 flex-1 truncate font-medium text-ink">{job.company}</p>
        {posted && (
          <p className="shrink-0 font-mono text-[12px] text-ink-3">
            <span aria-hidden>{posted}</span>
            <span className="sr-only">{postedLong}</span>
          </p>
        )}
      </div>

      {/* The title's words rise out of a mask, 30 ms apart, when the card comes to the top. */}
      {/* Long titles ("Graduate Economic Analyst (Entry-Level | No Experience Required)") step down a size so the match lines stay on the card. */}
      <h2 className={`display mt-4 leading-[1.05] text-ink text-balance ${job.title.length > 42 ? "text-[24px] sm:text-[26px]" : "text-[30px] sm:text-[34px]"}`}>
        {animate
          ? words.map((w, i) => (
              <span key={i}>
                <span className="-mb-[0.12em] inline-block overflow-hidden pb-[0.12em] align-bottom">
                  <motion.span
                    className="inline-block"
                    initial={{ y: "110%" }}
                    animate={{ y: active ? "0%" : "110%" }}
                    transition={active ? { type: "spring", stiffness: 420, damping: 34, delay: 0.06 + i * 0.03 } : { duration: 0 }}
                  >
                    {w}
                  </motion.span>
                </span>
                {i < words.length - 1 && " "}
              </span>
            ))
          : job.title}
      </h2>

      <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
        <Pill icon={<MapPin size={14} weight="bold" aria-hidden />}>{place}</Pill>
        <LevelBadge job={job} />
        {job.salary && <Pill className="num">{job.salary}</Pill>}
        {job.languages.length > 0 && <Pill icon={<Translate size={14} weight="bold" aria-hidden />}>Needs {job.languages.map((l) => l.join(" or ")).join(" and ")}</Pill>}
        {work === "check" && (
          <Pill tone="warn" icon={<IdentificationBadge size={14} weight="bold" aria-hidden />}>
            Check your stamp
          </Pill>
        )}
        {fit && <Pill tone={fit.tone}>{fit.label}</Pill>}
      </div>

      {job.seniority.evidence && (
        <p className="mt-3 line-clamp-2 font-mono text-[12px] leading-[1.5] text-ink-3">
          <span className="sr-only">The posting says: </span>“{job.seniority.evidence}”
        </p>
      )}

      <section aria-labelledby={matchId} aria-live="polite" className="mt-4 border-t border-line pt-4">
        <h3 id={matchId} className="text-caption font-medium text-ink-2">
          How you match
        </h3>
        {why ? (
          <ul className="mt-3 grid gap-2.5">
            {why.why.map((w, i) => {
              const k = WHY[w.kind];
              return (
                <motion.li
                  key={`${why.at}-${i}`}
                  initial={animate ? { opacity: 0, y: 10 } : false}
                  animate={active || !animate ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                  transition={t({ type: "spring", stiffness: 380, damping: 32, delay: active ? 0.22 + i * 0.09 : 0 })}
                  className="grid grid-cols-[28px_1fr] items-start gap-3 text-body text-ink"
                >
                  <motion.span
                    initial={animate ? { scale: 0.4 } : false}
                    animate={{ scale: active || !animate ? 1 : 0.4 }}
                    transition={t({ type: "spring", stiffness: 520, damping: 20, delay: active ? 0.26 + i * 0.09 : 0 })}
                    className={`grid size-7 place-items-center rounded-full ${k.tile}`}
                  >
                    <k.Icon size={16} weight={k.weight} aria-hidden />
                  </motion.span>
                  <span className="pt-0.5">
                    <span className="sr-only">{k.label}: </span>
                    {/* Strong lines are proven by a fact: the highlighter sweeps under them as they arrive. */}
                    {w.kind === "strong" ? (
                      <span className="highlight" data-on={active} style={{ transitionDelay: active ? `${0.42 + i * 0.09}s` : "0s" }}>
                        {w.text}
                      </span>
                    ) : (
                      w.text
                    )}
                  </span>
                </motion.li>
              );
            })}
          </ul>
        ) : whyError ? (
          <p className="mt-3 text-body text-ink-2">{whyError}</p>
        ) : (
          <div className="mt-3 grid gap-3">
            {[11, 9, 7].map((w) => (
              <div key={w} className="grid grid-cols-[28px_1fr] items-center gap-3">
                <Skeleton className="size-7 rounded-full" />
                <Skeleton className="h-3.5" />
              </div>
            ))}
            <p className="text-caption text-ink-3">Gemma is reading this one</p>
          </div>
        )}
      </section>

      {explain && (
        <div className="mt-4 border-t border-line">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={whyId}
            onClick={() => setOpen((o) => !o)}
            className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-pill px-2 text-left text-caption font-medium text-ink-2 hover:text-ink"
          >
            Why you&apos;re seeing this
            <CaretDown size={16} weight="bold" aria-hidden className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          <div id={whyId} hidden={!open} className="pb-2">
            {explain}
          </div>
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-3">
        {job.injections.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowInjection((s) => !s)}
            aria-expanded={showInjection}
            className="-mx-1 inline-flex min-h-11 items-center gap-1.5 rounded-pill px-1 text-left text-caption text-warn underline-offset-2 hover:underline"
          >
            <Robot size={16} aria-hidden className="shrink-0" />
            This posting talks to AI tools. Deis ignored it.
          </button>
        ) : (
          <span />
        )}
        {onDetails && !preview && (
          <button type="button" onClick={onDetails} className="link -mx-1 inline-flex min-h-11 items-center rounded-pill px-1 text-caption font-medium text-ink">
            Read the full posting
          </button>
        )}
      </div>
      {showInjection && (
        <ul className="mt-2 grid gap-2 rounded-panel bg-warn-soft p-3 text-caption text-ink">
          {job.injections.map((s, i) => (
            <li key={i}>
              <q>{s}</q>
            </li>
          ))}
        </ul>
      )}
      {/* The card scrolls inside when a posting runs long; this fade says there's more below. */}
      <div aria-hidden className="pointer-events-none sticky -bottom-5 -mx-5 -mb-5 mt-auto h-10 shrink-0 bg-gradient-to-t from-surface to-transparent sm:-bottom-6 sm:-mx-6 sm:-mb-6" />
    </article>
  );
}
