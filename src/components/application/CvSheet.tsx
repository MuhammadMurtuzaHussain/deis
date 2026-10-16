"use client";

import { motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { cvSections, REFERENCES, type CvDocument, type CvLine } from "@/lib/cv/compose";
import type { Header } from "@/lib/profile/types";
import { Item, Rise, useReveal, Wipe } from "./reveal";
import { lineMarkers } from "./trace";
import { useTraceMaybe } from "./useTrace";

// The CV as a sheet of paper: Arial, white in both themes (it's paper), the same sections
// in the same order as the Word file (cvSections). A 28 px gutter on the left holds the
// markers: one small mono number per fact a line cites, in a pop-soft pill. Selecting a
// marker (or its slip in the inspector) draws the highlighter over every line citing that
// fact. Code-owned lines (name, employers, titles, dates, degrees) have none. Neither the
// markers nor the highlighter ever print.

// The paper stays white in dark mode, so on it the highlighter uses the light tokens, fixed.
// A selected fact's lines get a deeper stroke than "Highlight sources" gives every line.
const PAPER_SOFT = "#ECFBC2";
const PAPER_DEEP = "#DEF68A";
export const PAPER_VARS = { "--pop-soft": PAPER_SOFT } as CSSProperties;
const DEEP = { "--pop-soft": PAPER_DEEP } as CSSProperties;

const MARK = "bg-[#ECFBC2] text-[#0E0F10] hover:bg-[#DEF68A]";
const MARK_ON = "bg-[#C8F03C] text-[#0E0F10] shadow-[inset_0_0_0_1px_rgb(14_15_16/0.35)]";
// Off the paper (form answers), the theme's own tokens.
const UI_MARK = "bg-pop-soft text-ink hover:shadow-[inset_0_0_0_1px_var(--control-border)]";
const UI_MARK_ON = "bg-pop text-pop-ink";

/** The numbered markers for one line. ui: on a themed surface rather than the white paper. */
export function Markers({ facts, ui, pop }: { facts: string[]; ui?: boolean; /** While the kit writes itself: when (s) this line's markers pop in. */ pop?: number }) {
  const trace = useTraceMaybe();
  const plan = useReveal();
  if (!trace) return null;
  const ids = lineMarkers(facts, trace.numbers);
  if (!ids.length) return null;
  // Absolute with no top: it sits level with the start of its line, at the gutter's left edge.
  return (
    <span data-trace className={`flex gap-1 font-sans print:hidden ${ui ? "flex-wrap" : "absolute left-0 w-6 flex-col items-start"}`}>
      {ids.map((id) => {
        const n = trace.numbers.get(id)!;
        const on = trace.active === id;
        return (
          <motion.button
            key={plan && pop !== undefined ? `${id}-${plan.run}` : id}
            initial={plan && pop !== undefined ? { scale: 0.2, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={plan && pop !== undefined ? { delay: pop, type: "spring", stiffness: 600, damping: 22 } : { duration: 0 }}
            type="button"
            data-marker={id}
            aria-pressed={on}
            aria-label={`Source ${n}: ${trace.facts.get(id)?.text ?? "a fact"}`}
            onClick={() => trace.select(id, "marker")}
            className={`grid h-5 min-w-6 scroll-mt-36 scroll-mb-28 place-items-center rounded-full px-1 font-mono text-[11px] leading-none font-semibold transition-[background-color,box-shadow] duration-150 ${ui ? (on ? UI_MARK_ON : UI_MARK) : on ? MARK_ON : MARK}`}
          >
            {n}
          </motion.button>
        );
      })}
    </span>
  );
}

/** Room for a stack of markers, so one line's markers never run into the next line's. */
export const stackHeight = (n: number) => (n > 1 ? { minHeight: n * 24 - 4 } : undefined);

/** For one line: lit (its fact is selected), on (it carries the highlighter) and how many markers it has. */
export function useLine() {
  const trace = useTraceMaybe();
  return (facts: string[]) => {
    if (!trace) return { lit: false, on: false, count: 0 };
    const count = lineMarkers(facts, trace.numbers).length;
    const lit = Boolean(trace.active && facts.includes(trace.active));
    return { lit, on: lit || (trace.all && count > 0), count };
  };
}

/** Text that takes the highlighter. On paper, a selected fact's lines get the deeper stroke. */
export function Marked({ on, lit, paper, children }: { on: boolean; lit: boolean; paper?: boolean; children: ReactNode }) {
  return (
    <span className="highlight" data-on={on} style={paper && lit ? DEEP : undefined}>
      {children}
    </span>
  );
}

function Text({ line, on, lit, print }: { line: CvLine; on: boolean; lit: boolean; print?: boolean }) {
  const body = (
    <>
      {line.label && <strong>{line.label}: </strong>}
      {line.text}
    </>
  );
  if (print) return body;
  return (
    <Marked on={on} lit={lit} paper>
      {body}
    </Marked>
  );
}

function H({ children }: { children: string }) {
  return <h3 className="mt-4 border-b border-[#1F2A2E] pb-0.5 text-[13px] font-bold tracking-wide text-[#1F2A2E] uppercase">{children}</h3>;
}

/** The paper itself: white in both themes, a hairline and a soft shadow. */
export const PAPER = "w-full min-w-0 rounded-panel border border-line bg-white font-paper text-[#1a1a1a] shadow-card";

export function CvSheet({ cv, header, id, className = "", print }: { cv: CvDocument; header?: Header; id?: string; className?: string; print?: boolean }) {
  const line = useLine();
  const plan = useReveal();
  const traced = (facts: string[]) => (print ? { lit: false, on: false, count: 0 } : line(facts));
  // While the kit writes itself, each row starts `step` after the one before.
  const step = !print && plan ? plan.step : 0;
  let row = 0;
  const next = () => row++ * step;
  const live = !print;
  return (
    <article
      id={id}
      aria-label="CV preview"
      style={print ? undefined : PAPER_VARS}
      className={`${PAPER} aspect-[210/297] py-7 pr-5 pl-1 text-[13px] leading-relaxed sm:py-11 sm:pr-11 sm:pl-4 ${className}`}
    >
      <div className={print ? "" : "relative pl-7"}>
        {cvSections(cv, header).map((s) => {
          if (s.id === "header")
            return (
              <Rise key="header" at={live ? next() : 0}>
                <p className="text-center text-2xl font-bold text-[#1F2A2E]">{s.name}</p>
                <p className="mt-1 text-center text-[12px] break-words text-[#333]">{s.contact}</p>
              </Rise>
            );
          const para = s.paragraph ?? [];
          const paraFacts = [...new Set(para.flatMap((l) => l.facts))];
          const headAt = next();
          return (
            <section key={s.id}>
              <Rise at={headAt}>
                <H>{s.title}</H>
              </Rise>
              {para.length > 0 &&
                (() => {
                  const at = next();
                  return (
                    <div className="mt-1.5" style={print ? undefined : stackHeight(traced(paraFacts).count)}>
                      {live && <Markers facts={paraFacts} pop={at + 0.18} />}
                      <Wipe at={at}>
                        {para.map((l, i) => (
                          <span key={i}>
                            {i > 0 && " "}
                            <Text line={l} {...traced(l.facts)} print={print} />
                          </span>
                        ))}
                      </Wipe>
                    </div>
                  );
                })()}
              {s.entries?.map((e, i) => (
                <div key={i} className="mt-2">
                  <Wipe at={next()}>
                    <span className="flex justify-between gap-4 font-bold">
                      <span>{e.heading}</span>
                      <span className="shrink-0">{e.dates}</span>
                    </span>
                  </Wipe>
                  {e.lines.length > 0 && (
                    <ul className="list-disc pl-5">
                      {e.lines.map((l, j) => {
                        const at = next();
                        return (
                          <Item key={j} at={at} style={print ? undefined : stackHeight(traced(l.facts).count)}>
                            {live && <Markers facts={l.facts} pop={at + 0.18} />}
                            <Wipe at={at}>
                              <Text line={l} {...traced(l.facts)} print={print} />
                            </Wipe>
                          </Item>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
              {s.bullets && s.bullets.length > 0 && (
                <ul className="mt-1.5 list-disc pl-5">
                  {s.bullets.map((b, i) => {
                    const at = next();
                    return (
                      <Item key={i} at={at} style={print ? undefined : stackHeight(traced(b.facts).count)}>
                        {live && <Markers facts={b.facts} pop={at + 0.18} />}
                        <Wipe at={at}>
                          <Text line={b} {...traced(b.facts)} print={print} />
                        </Wipe>
                      </Item>
                    );
                  })}
                </ul>
              )}
              {s.lists?.map((l, i) => (
                <Wipe key={i} at={next()} className="mt-1.5">
                  {l.label && <strong>{l.label}: </strong>}
                  {l.items.join(", ")}
                </Wipe>
              ))}
            </section>
          );
        })}
        <Wipe at={next()} className="mt-5 italic">
          {REFERENCES}
        </Wipe>
      </div>
    </article>
  );
}

/**
 * "Save as PDF" prints this copy alone: the sheet with no markers, and every other child of
 * <body> hidden (display, not just visibility), so nothing after it makes blank pages.
 */
export function PrintSheet({ cv, header }: { cv: CvDocument; header?: Header }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <style>
        {
          "@media print { body > :not(#cv-print) { display: none !important; } #cv-print { position: static !important; aspect-ratio: auto !important; min-height: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; } }"
        }
      </style>
      <CvSheet cv={cv} header={header} print id="cv-print" className="hidden print:block" />
    </>,
    document.body,
  );
}
