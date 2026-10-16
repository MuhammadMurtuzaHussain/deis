"use client";

import { animate } from "motion/react";
import { arrive, flyTarget } from "../ui";

// Apply feedback (MAGIC.md moment 1): a small copy of the applied card arcs from the deck into
// the Applications tab (top bar on desktop, tab bar on phones), which pulses as it lands. It
// shows where the kit is now being built. A plain element on <body>, removed when it lands;
// callers skip it under reduced motion (the toast and the live region say it instead).

export function flyToApplications(card: HTMLElement, job: { title: string; company: string }) {
  const target = flyTarget("applications");
  if (!target) return;
  const from = card.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (!from.width || !to.width) return;

  const ghost = document.createElement("div");
  ghost.setAttribute("aria-hidden", "true");
  ghost.className = "pointer-events-none fixed z-[85] grid content-start gap-2 overflow-hidden rounded-card border border-line bg-surface p-6 shadow-lift";
  Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${Math.min(from.height, 260)}px`, transformOrigin: "50% 50%", willChange: "transform, opacity" });
  const company = document.createElement("p");
  company.className = "font-medium text-ink-2";
  company.textContent = job.company;
  const title = document.createElement("p");
  title.className = "display text-[32px] leading-[1.05] text-ink";
  title.textContent = job.title;
  const bar = document.createElement("span");
  bar.className = "mt-2 h-2 w-24 rounded-full bg-pop";
  ghost.append(company, title, bar);
  document.body.append(ghost);

  const h = Math.min(from.height, 260);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + h / 2);
  const end = Math.max(0.03, 22 / from.width);

  void animate(
    ghost,
    {
      x: [0, 50, dx * 0.6 + 70, dx],
      y: [0, -16, dy * 0.45 - 50, dy],
      scale: [0.94, 0.78, 0.3, end],
      rotate: [0, 7, -6, 0],
      opacity: [0, 1, 1, 0.15],
    },
    { duration: 0.82, times: [0, 0.14, 0.6, 1], ease: [0.45, 0, 0.2, 1] },
  ).then(() => {
    ghost.remove();
    arrive("applications");
  });
}
