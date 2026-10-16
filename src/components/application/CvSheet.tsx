"use client";

import { createPortal } from "react-dom";
import { cvSections, REFERENCES, type CvDocument, type CvLine } from "@/lib/cv/compose";
import type { Header } from "@/lib/profile/types";
import { lineMarkers } from "./trace";
import { useTraceMaybe } from "./useTrace";

// The CV as a sheet of paper: Arial, white in both themes (it's paper), the same sections
// in the same order as the Word file (cvSections). A 28 px gutter on the left holds the
// proof-reader's marks: one numbered marker per fact a line cites. Code-owned lines
// (name, employers, titles, dates, degrees) have none. Markers never print.

// The paper stays light in dark mode, so its trace colours are the light tokens, fixed.
const MARK = "border border-[#2D5B8A]/45 bg-[#F3F7FB] text-[#2D5B8A] hover:bg-[#E3ECF5]";
const MARK_ON = "border border-[#2D5B8A] bg-[#2D5B8A] text-white";
export const LIT = "bg-[#E3ECF5] shadow-[0_0_0_3px_#E3ECF5]";
// Off the paper (form answers), the theme's own trace tokens.
const UI_MARK = "border border-trace/50 bg-trace-soft text-trace hover:border-trace";
const UI_MARK_ON = "border border-trace bg-trace text-raised";

/** The numbered markers for one line. ui: on a themed surface rather than the white paper. */
export function Markers({ facts, ui }: { facts: string[]; ui?: boolean }) {
  const trace = useTraceMaybe();
  if (!trace?.on) return null;
  const ids = lineMarkers(facts, trace.numbers);
  if (!ids.length) return null;
  // Absolute with no top: it sits level with the start of its line, at the gutter's left edge.
  return (
    <span data-trace className={`flex gap-1 font-sans print:hidden ${ui ? "flex-wrap" : "absolute left-0 w-6 flex-col"}`}>
      {ids.map((id) => {
        const n = trace.numbers.get(id)!;
        const on = trace.active === id;
        return (
          <button
            key={id}
            type="button"
            data-marker={id}
            aria-pressed={on}
            aria-label={`Source ${n}: ${trace.facts.get(id)?.text ?? "a fact"}`}
            onClick={() => trace.select(id, "marker")}
            className={`grid h-5 w-6 place-items-center rounded-full font-mono text-[11px] leading-none font-bold transition-colors duration-150 ${ui ? (on ? UI_MARK_ON : UI_MARK) : on ? MARK_ON : MARK}`}
          >
            {n}
          </button>
        );
      })}
    </span>
  );
}

/** Room for a stack of markers, so one line's markers never run into the next line's. */
export const stackHeight = (n: number) => (n > 1 ? { minHeight: n * 24 - 4 } : undefined);

export function useLine() {
  const trace = useTraceMaybe();
  return (facts: string[]) => {
    if (!trace?.on) return { lit: false, count: 0 };
    return { lit: Boolean(trace.active && facts.includes(trace.active)), count: lineMarkers(facts, trace.numbers).length };
  };
}

function Text({ line, lit }: { line: CvLine; lit: boolean }) {
  return (
    <span className={`rounded-[2px] box-decoration-clone transition-colors duration-150 ${lit ? LIT : ""}`}>
      {line.label && <strong>{line.label}: </strong>}
      {line.text}
    </span>
  );
}

function H({ children }: { children: string }) {
  return <h3 className="mt-4 border-b border-[#1F2A2E] pb-0.5 text-[13px] font-bold tracking-wide text-[#1F2A2E] uppercase">{children}</h3>;
}

export function CvSheet({ cv, header, id, className = "", print }: { cv: CvDocument; header?: Header; id?: string; className?: string; print?: boolean }) {
  const line = useLine();
  const traced = (facts: string[]) => (print ? { lit: false, count: 0 } : line(facts));
  return (
    <article
      id={id}
      aria-label="CV preview"
      className={`aspect-[210/297] w-full min-w-0 rounded-surface bg-white py-7 pr-5 pl-1 font-paper text-[13px] leading-relaxed text-[#1a1a1a] shadow-card sm:py-11 sm:pr-11 sm:pl-4 ${className}`}
    >
      <div className={print ? "" : "relative pl-7"}>
        {cvSections(cv, header).map((s) => {
          if (s.id === "header")
            return (
              <div key="header">
                <p className="text-center text-2xl font-bold text-[#1F2A2E]">{s.name}</p>
                <p className="mt-1 text-center text-[12px] break-words text-[#333]">{s.contact}</p>
              </div>
            );
          const para = s.paragraph ?? [];
          const paraFacts = [...new Set(para.flatMap((l) => l.facts))];
          return (
            <section key={s.id}>
              <H>{s.title}</H>
              {para.length > 0 && (
                <p className="mt-1.5" style={print ? undefined : stackHeight(traced(paraFacts).count)}>
                  {!print && <Markers facts={paraFacts} />}
                  {para.map((l, i) => (
                    <span key={i}>
                      {i > 0 && " "}
                      <Text line={l} lit={traced(l.facts).lit} />
                    </span>
                  ))}
                </p>
              )}
              {s.entries?.map((e, i) => (
                <div key={i} className="mt-2">
                  <p className="flex justify-between gap-4 font-bold">
                    <span>{e.heading}</span>
                    <span className="shrink-0">{e.dates}</span>
                  </p>
                  {e.lines.length > 0 && (
                    <ul className="list-disc pl-5">
                      {e.lines.map((l, j) => (
                        <li key={j} style={print ? undefined : stackHeight(traced(l.facts).count)}>
                          {!print && <Markers facts={l.facts} />}
                          <Text line={l} lit={traced(l.facts).lit} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {s.bullets && s.bullets.length > 0 && (
                <ul className="mt-1.5 list-disc pl-5">
                  {s.bullets.map((b, i) => (
                    <li key={i} style={print ? undefined : stackHeight(traced(b.facts).count)}>
                      {!print && <Markers facts={b.facts} />}
                      <Text line={b} lit={traced(b.facts).lit} />
                    </li>
                  ))}
                </ul>
              )}
              {s.lists?.map((l, i) => (
                <p key={i} className="mt-1.5">
                  {l.label && <strong>{l.label}: </strong>}
                  {l.items.join(", ")}
                </p>
              ))}
            </section>
          );
        })}
        <p className="mt-5 italic">{REFERENCES}</p>
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
          "@media print { body > :not(#cv-print) { display: none !important; } #cv-print { position: static !important; aspect-ratio: auto !important; min-height: 0 !important; padding: 0 !important; border-radius: 0 !important; box-shadow: none !important; } }"
        }
      </style>
      <CvSheet cv={cv} header={header} print id="cv-print" className="hidden print:block" />
    </>,
    document.body,
  );
}
