"use client";

import { Check, CircleDashed, MapPin, Path, Warning } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Pill } from "../ui";

// Small static renders for Welcome, styled like the real deck card, fit panel and CV sheet.
// They're pictures of the product, not the components themselves, so they can't break when
// those change and never call a model. Everything in them is decorative sample data, so the
// renders sit inside figures with a plain caption that says what they show.

const SAMPLE = {
  company: "Corrib Health",
  title: "Graduate Data Analyst",
  place: "Galway, remote possible",
  pay: "€34,000 to €38,000",
  evidence: "Our graduate programme is open to recent graduates.",
};

type Kind = "strong" | "transferable" | "gap";

const MARK: Record<Kind, { Icon: typeof Check; cls: string; label: string }> = {
  strong: { Icon: Check, cls: "bg-accent text-accent-ink", label: "Strong match" },
  transferable: { Icon: CircleDashed, cls: "border border-control-border text-ink-2", label: "Carries over" },
  gap: { Icon: Warning, cls: "bg-ochre-soft text-ochre", label: "Gap" },
};

function Line({ kind, children }: { kind: Kind; children: ReactNode }) {
  const m = MARK[kind];
  return (
    <li className="flex items-start gap-2.5 text-body text-ink">
      <span aria-hidden className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${m.cls}`}>
        <m.Icon size={12} weight="bold" />
      </span>
      <span className="min-w-0">
        <span className="sr-only">{m.label}: </span>
        {children}
      </span>
    </li>
  );
}

/** The index card: company in small caps, a Newsreader title, the quoted evidence and "How you match". */
export function SampleCard({ compact }: { compact?: boolean }) {
  return (
    <div className={`rounded-card border border-line bg-raised shadow-card ${compact ? "p-4" : "p-6"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="smallcaps text-ink-2">{SAMPLE.company}</p>
        <p className="text-caption text-ink-3">Posted 3 days ago</p>
      </div>
      <p className={`display mt-1 text-ink ${compact ? "text-title" : "text-[28px] leading-tight"}`}>{SAMPLE.title}</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <MapPin size={16} aria-hidden />
          {SAMPLE.place}
        </span>
        <span className="num">{SAMPLE.pay}</span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Pill>Early career</Pill>
        <Pill tone="go" icon={<Check size={12} weight="bold" aria-hidden />}>
          Good fit
        </Pill>
      </div>
      {!compact && <blockquote className="mt-3 border-l border-control-border pl-3 text-caption text-ink-2 italic">“{SAMPLE.evidence}”</blockquote>}
      <p className="mt-4 text-caption font-bold text-ink-2">How you match</p>
      <ul className="mt-2 grid gap-2">
        <Line kind="strong">Built Power BI dashboards on delivery times for 5 managers</Line>
        <Line kind="transferable">MSc thesis forecasting footfall in Python carries over</Line>
        {!compact && <Line kind="gap">No healthcare data shown yet</Line>}
      </ul>
    </div>
  );
}

/** The fit check: a Newsreader verdict and the posting's must-haves, each matched or not. */
export function SampleFit() {
  return (
    <div className="rounded-surface border border-line bg-raised p-4 shadow-card">
      <p className="text-caption text-ink-3">Fit for {SAMPLE.title}</p>
      <p className="display mt-1 text-title text-ink">Good fit, one gap</p>
      <ul className="mt-3 grid gap-2">
        <Line kind="strong">SQL and Power BI reporting</Line>
        <Line kind="transferable">Forecasting, from the MSc thesis</Line>
        <Line kind="gap">Healthcare data: say how you&apos;d learn it</Line>
      </ul>
      <p className="mt-3 border-t border-line pt-3 text-caption text-ink-2">Right to work: open to Stamp 1G graduates.</p>
    </div>
  );
}

/** A CV sheet with trace markers in the margin and the fact the first one points to. */
export function SampleTrace() {
  const lines: [number | null, string][] = [
    [null, "Junior Data Analyst, Lantern Logistics"],
    [1, "Built Power BI dashboards on delivery times for 5 regional managers."],
    [2, "Automated a weekly Excel report in Python, saving about 3 hours a week."],
  ];
  // The sheet is white paper in both themes, so its markers use the light theme's trace blue.
  return (
    <div className="grid gap-2">
      <div className="rounded-surface bg-white p-4 font-paper text-[13px] leading-snug text-black shadow-card">
        <p className="text-[11px] font-bold tracking-wide uppercase">Work experience</p>
        <ul className="mt-2 grid gap-1.5">
          {lines.map(([n, text]) => (
            <li key={text} className="grid grid-cols-[22px_1fr] items-start gap-1">
              <span aria-hidden className="pt-px">
                {n && <span className={`grid size-[18px] place-items-center rounded-full font-mono text-[10px] ${n === 1 ? "bg-[#2D5B8A] text-white" : "border border-[#2D5B8A] text-[#2D5B8A]"}`}>{n}</span>}
              </span>
              <span className={n ? "" : "font-bold"}>
                {n && <span className="sr-only">Traced to fact {n}: </span>}
                {text}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-start gap-2 rounded-control border-l-[3px] border-trace bg-trace-soft px-3 py-2 text-caption text-ink">
        <Path size={16} aria-hidden className="mt-0.5 shrink-0 text-trace" />
        <span>
          <span className="font-mono text-trace">1</span> You told Deis: built Power BI dashboards on delivery times for 5 regional managers. <span className="text-ink-2">Lantern Logistics</span>
        </span>
      </div>
    </div>
  );
}

/** One beat of the story: a number, a heading, a sentence and the picture. */
export function Beat({ n, title, children, picture }: { n: number; title: string; children: ReactNode; picture: ReactNode }) {
  return (
    <li className="grid content-start gap-4">
      <div>
        <p className="display num text-title text-ink-3" aria-hidden>
          {n}
        </p>
        <h3 className="mt-1 text-lead font-bold text-ink">{title}</h3>
        <p className="mt-1 text-body text-ink-2">{children}</p>
      </div>
      <figure aria-label={`Example: ${title.toLowerCase()}`}>{picture}</figure>
    </li>
  );
}
