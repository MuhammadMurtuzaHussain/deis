"use client";

import { ArrowsLeftRight, CheckCircle, CircleDashed, IdentificationBadge } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useEffect, useState, type CSSProperties } from "react";
import type { CardCache } from "@/lib/client/db";
import type { ScoredJob } from "@/lib/jobs/types";
import { useMotion } from "../ui";

// Sample data and the pictures for Welcome. The cards on Welcome are the real JobCard fed these
// samples; the CV excerpts are drawn with the same paper, markers and highlighter as the kit.
// Every company, employer and fact here is invented sample data about one sample graduate.

const DAY = 86_400_000;

type Why = CardCache["why"];

function sample(id: string, title: string, company: string, city: string, days: number, salary: string | null, why: Why, extra: Partial<ScoredJob> = {}): { job: ScoredJob; why: CardCache } {
  const job: ScoredJob = {
    id,
    source: "greenhouse",
    title,
    company,
    location: `${city}, Ireland`,
    city,
    remote: false,
    postedAt: new Date(Date.now() - days * DAY).toISOString(),
    description: "",
    salary,
    apply: [],
    url: "https://example.ie/jobs",
    seniority: { level: "early", yearsMin: null, evidence: null },
    rightToWork: { stance: "unknown", evidence: null },
    injections: [],
    languages: [],
    ...extra,
  };
  return { job, why: { jobId: id, at: 0, score: 0, why } };
}

/** The sample deck that plays itself on Welcome. dir: what it does with each; cv: the CV line an Apply writes. */
export const SAMPLES: { job: ScoredJob; why: CardCache; dir: "apply" | "skip" | "save"; cv: { fact: number; text: string } }[] = [
  {
    ...sample(
      "sample-corrib",
      "Graduate Data Analyst",
      "Corrib Health",
      "Galway",
      3,
      "€34,000 to €38,000",
      [
        { kind: "strong", text: "Built Power BI dashboards on delivery times for 5 regional managers.", facts: ["1"] },
        { kind: "transferable", text: "Your MSc thesis forecast footfall in Python, close to their demand work.", facts: ["3"] },
        { kind: "gap", text: "No healthcare data yet. Say how you would learn it.", facts: [] },
      ],
      { remote: true, seniority: { level: "early", yearsMin: null, evidence: "Our graduate programme is open to recent graduates." } },
    ),
    dir: "apply",
    cv: { fact: 1, text: "Built Power BI dashboards on delivery times for 5 regional managers." },
  },
  {
    ...sample("sample-shannon", "Pricing Analyst", "Shannon Freight", "Limerick", 6, null, [
      { kind: "transferable", text: "Your Excel reporting carries over to pricing models.", facts: ["2"] },
      { kind: "gap", text: "Asks for pricing experience you haven't shown.", facts: [] },
      { kind: "gap", text: "Asks for about 2 years in freight.", facts: [] },
    ], { seniority: { level: "stretch", yearsMin: 2, evidence: "2+ years in a pricing or commercial role." } }),
    dir: "skip",
    cv: { fact: 2, text: "" },
  },
  {
    ...sample("sample-liffey", "Data Engineering Graduate", "Liffey Labs", "Dublin", 1, "€38,000", [
      { kind: "strong", text: "Automated a weekly Excel report in Python, saving 3 hours a week.", facts: ["2"] },
      { kind: "strong", text: "MSc Data Analytics with a Python forecasting thesis.", facts: ["3"] },
      { kind: "gap", text: "No cloud pipelines yet. Name one you could build.", facts: [] },
    ], { remote: true }),
    dir: "apply",
    cv: { fact: 2, text: "Automated a weekly Excel report in Python, saving about 3 hours a week." },
  },
  {
    ...sample("sample-ballyhoura", "Trainee Business Analyst", "Ballyhoura Energy", "Cork", 9, null, [
      { kind: "transferable", text: "Presenting figures to managers carries over to stakeholder work.", facts: ["1"] },
      { kind: "strong", text: "Power BI reporting, which the role lists first.", facts: ["1"] },
      { kind: "gap", text: "No energy sector work yet.", facts: [] },
    ], { rightToWork: { stance: "sponsors", evidence: null } }),
    dir: "save",
    cv: { fact: 1, text: "" },
  },
];

export const SAMPLE_JOB = SAMPLES[0].job;
export const SAMPLE_WHY = SAMPLES[0].why;

type Fact = { n: number; text: string };

const FACTS: Fact[] = [
  { n: 1, text: "Built Power BI dashboards on delivery times, used by 5 regional managers" },
  { n: 2, text: "Automated a weekly Excel report in Python, saving about 3 hours a week" },
  { n: 3, text: "MSc Data Analytics, University of Galway: thesis forecasting retail footfall in Python" },
];

const LINES: { fact: number; text: string }[] = [
  { fact: 1, text: "Built Power BI dashboards on delivery times for 5 regional managers." },
  { fact: 2, text: "Automated a weekly Excel report in Python, saving about 3 hours a week." },
  { fact: 1, text: "Presented weekly delivery figures to the regional managers." },
];

// The CV sheet is white paper in both themes, so the highlighter keeps its light-theme colour on it.
export const PAPER: CSSProperties = { ["--pop-soft" as string]: "#ECFBC2" };

export function Marker({ n }: { n: number }) {
  return <span className="inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#ECFBC2] px-1 font-mono text-[10px] leading-none text-[#0E0F10]">{n}</span>;
}

/** True a moment after mount, so the highlighter visibly draws in (220 ms; a fade under reduced motion). */
function useDrawn(delay = 700) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return on;
}

/** One CV line that writes itself in (a clip-path wipe), then gets the highlighter: what an Apply turns into. */
export function WriteLine({ fact, text }: { fact: number; text: string }) {
  const { reduce } = useMotion();
  const lit = useDrawn(reduce ? 0 : 620);
  return (
    <div style={PAPER} className="rounded-panel border border-line bg-white px-4 py-3.5 font-paper text-[13.5px] leading-snug text-black shadow-card">
      <p className="grid grid-cols-[24px_1fr] items-start gap-1">
        <motion.span aria-hidden className="pt-px" initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 18, delay: 0.5 }}>
          <Marker n={fact} />
        </motion.span>
        <motion.span initial={reduce ? false : { clipPath: "inset(0 100% 0 0)" }} animate={{ clipPath: "inset(0 0% 0 0)" }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
          <span className="sr-only">CV line, traced to fact {fact}: </span>
          <span className="highlight" data-on={lit}>
            {text}
          </span>
        </motion.span>
      </p>
    </div>
  );
}

/** A CV excerpt beside its fact slips: pick a fact and the lines it backs light up. stacked: one column. */
export function TraceDemo({ stacked, play = true }: { stacked?: boolean; play?: boolean }) {
  const [picked, setPicked] = useState(1);
  const drawn = useDrawn(300) && play;
  return (
    <div className={`grid gap-4 ${stacked ? "" : "md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:gap-6"}`}>
      <div style={PAPER} className={`rounded-panel border border-line bg-white font-paper text-[14px] leading-snug text-black shadow-card ${stacked ? "p-5" : "p-5 sm:p-7"}`}>
        <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
          <span className="font-bold">Junior Data Analyst, Lantern Logistics</span>
          <span className="text-[12.5px] text-[#4B4D52]">Jan 2025 – Present</span>
        </p>
        <ul className="mt-3 grid gap-2">
          {LINES.map((l) => (
            <li key={l.text} className="grid grid-cols-[26px_1fr] items-start gap-1">
              <span aria-hidden className="pt-px">
                <Marker n={l.fact} />
              </span>
              <span>
                <span className="sr-only">Traced to fact {l.fact}: </span>
                <span className="highlight" data-on={drawn && l.fact === picked}>
                  {l.text}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 font-bold">MSc Data Analytics, University of Galway</p>
        <ul className="mt-2 grid gap-2">
          <li className="grid grid-cols-[26px_1fr] items-start gap-1">
            <span aria-hidden className="pt-px">
              <Marker n={3} />
            </span>
            <span>
              <span className="sr-only">Traced to fact 3: </span>
              <span className="highlight" data-on={drawn && picked === 3}>
                Thesis: forecasting retail footfall in Python.
              </span>
            </span>
          </li>
        </ul>
      </div>

      <div role="group" aria-label="Your facts" className="grid content-start gap-2">
        {FACTS.map((f) => {
          const used = LINES.filter((l) => l.fact === f.n).length + (f.n === 3 ? 1 : 0);
          const on = picked === f.n;
          return (
            <button
              key={f.n}
              type="button"
              aria-pressed={on}
              onClick={() => setPicked(f.n)}
              onMouseEnter={() => setPicked(f.n)}
              className={`grid grid-cols-[28px_1fr] gap-3 rounded-panel border bg-surface text-left transition-[border-color,box-shadow,transform] active:scale-[0.98] ${stacked ? "p-3" : "p-4"} ${on ? "border-ink shadow-card" : "border-line hover:border-control-border"}`}
            >
              <span aria-hidden className="grid h-6 min-w-6 place-items-center rounded-full bg-pop-soft font-mono text-[12px] text-ink">
                {f.n}
              </span>
              <span className="min-w-0">
                <span className={`block text-ink ${stacked ? "text-caption" : "text-body"}`}>{f.text}</span>
                <span className="mt-1 block font-mono text-[12px] text-ink-3">
                  used in {used} {used === 1 ? "line" : "lines"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const FIT: { kind: "strong" | "transferable" | "gap"; need: string; have: string }[] = [
  { kind: "strong", need: "SQL and Power BI reporting", have: "Fact 1: dashboards for 5 regional managers" },
  { kind: "transferable", need: "Forecasting demand", have: "Fact 3: your MSc footfall thesis" },
  { kind: "gap", need: "Healthcare data", have: "Not in your profile. Deis will ask you about it." },
];

const FIT_TILE = {
  strong: { Icon: CheckCircle, weight: "fill" as const, tile: "bg-pop-soft text-ink", label: "Matched" },
  transferable: { Icon: ArrowsLeftRight, weight: "bold" as const, tile: "bg-sunken text-ink-2", label: "Carries over" },
  gap: { Icon: CircleDashed, weight: "bold" as const, tile: "bg-warn-soft text-warn", label: "Gap" },
};

/** The fit check: a verdict and the posting's must-haves, each matched to a fact or named as a gap. */
export function FitPanel() {
  return (
    <div className="rounded-card border border-line bg-surface p-6 shadow-card">
      <p className="text-caption text-ink-3">Fit for Graduate Data Analyst, Corrib Health</p>
      <p className="display mt-2 text-[30px] leading-[1.05] text-ink">Good fit, one gap</p>
      <ul className="mt-5 grid gap-3 border-t border-line pt-5">
        {FIT.map((f) => {
          const k = FIT_TILE[f.kind];
          return (
            <li key={f.need} className="grid grid-cols-[28px_1fr] items-start gap-3">
              <span aria-hidden className={`grid size-7 place-items-center rounded-full ${k.tile}`}>
                <k.Icon size={16} weight={k.weight} />
              </span>
              <span>
                <span className="sr-only">{k.label}: </span>
                <span className="block text-body font-medium text-ink">{f.need}</span>
                <span className="block font-mono text-[12px] text-ink-3">{f.have}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-5 flex items-start gap-2 border-t border-line pt-4 text-caption text-ink-2">
        <IdentificationBadge size={16} weight="bold" aria-hidden className="mt-0.5 shrink-0" />
        Right to work: says it can sponsor a permit. Your status: Stamp 1G.
      </p>
    </div>
  );
}
