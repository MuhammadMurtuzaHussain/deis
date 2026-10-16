"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTrace } from "./useTrace";

// Trace connectors (MAGIC moment 2): with a fact selected, a line draws from its slip in the
// inspector to the right edge of the paper beside every line that cites it (pathLength 0 to
// 1 in 280 ms), while those lines take the highlighter. Desktop only, where the panes sit
// side by side. Positions are measured once a frame at most (rAF), on selection, scroll and
// resize (ResizeObserver), and nothing is drawn for a slip or line that's out of view.
// Decorative: the slip and the highlighted lines already say the same thing.

type Link = { key: string; d: string; x: number; y: number };

const STROKE = "color-mix(in oklab, var(--pop) 62%, var(--ink))";

export function TraceConnectors() {
  const { active, railRef } = useTrace();
  const reduce = useReducedMotion();
  const svgRef = useRef<SVGSVGElement>(null);
  const [links, setLinks] = useState<{ start: { x: number; y: number }; paths: Link[] } | null>(null);

  useEffect(() => {
    const wide = matchMedia("(min-width: 1024px)");
    let frame = 0;
    const measure = () => {
      frame = 0;
      const svg = svgRef.current;
      const slip = active ? document.querySelector<HTMLElement>(`[data-slip="${CSS.escape(active)}"]`) : null;
      if (!svg || !slip || !wide.matches) return setLinks(null);
      const box = svg.getBoundingClientRect();
      const rail = railRef.current?.getBoundingClientRect();
      const s = slip.getBoundingClientRect();
      const sy = s.top + Math.min(s.height / 2, 18);
      if (rail && (sy < rail.top + 4 || sy > rail.bottom - 4)) return setLinks(null);
      const start = { x: s.left - box.left - 2, y: sy - box.top };
      const paths: Link[] = [];
      document.querySelectorAll<HTMLElement>(`[data-marker="${CSS.escape(active!)}"]`).forEach((m, i) => {
        const paper = m.closest("article") ?? m.closest("li");
        if (!paper) return;
        const r = m.getBoundingClientRect();
        const p = paper.getBoundingClientRect();
        const y = r.top + r.height / 2 - box.top;
        if (y < 0 || y > box.height) return;
        const x = p.right - box.left - 10;
        const mid = (start.x - x) / 2;
        paths.push({ key: `${active}-${i}`, d: `M ${start.x} ${start.y} C ${start.x - mid} ${start.y}, ${x + mid} ${y}, ${x} ${y}`, x, y });
      });
      setLinks(paths.length ? { start, paths } : null);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    schedule();
    if (!active) return () => cancelAnimationFrame(frame);
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    const rail = railRef.current;
    if (rail) ro.observe(rail);
    window.addEventListener("scroll", schedule, { passive: true });
    rail?.addEventListener("scroll", schedule, { passive: true });
    wide.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("scroll", schedule);
      rail?.removeEventListener("scroll", schedule);
      wide.removeEventListener("change", schedule);
    };
  }, [active, railRef]);

  const draw = reduce ? { initial: { opacity: 0 }, animate: { opacity: 1 } } : { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 } };

  return (
    <svg ref={svgRef} aria-hidden data-print-hidden className="pointer-events-none fixed inset-x-0 top-(--top-bar) bottom-0 z-20 hidden h-[calc(100dvh-var(--top-bar))] w-full overflow-visible print:hidden lg:block">
      {links && (
        <g>
          {links.paths.map((p) => (
            <g key={p.key}>
              <motion.path d={p.d} fill="none" stroke={STROKE} strokeWidth={1.5} strokeLinecap="round" {...draw} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} />
              <motion.circle cx={p.x} cy={p.y} r={3.5} fill="var(--pop)" stroke={STROKE} strokeWidth={1.25} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={reduce ? { duration: 0 } : { delay: 0.22, type: "spring", stiffness: 600, damping: 24 }} />
            </g>
          ))}
          <circle cx={links.start.x} cy={links.start.y} r={3} fill={STROKE} />
        </g>
      )}
    </svg>
  );
}
