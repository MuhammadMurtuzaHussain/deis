"use client";

import { useEffect, useRef } from "react";

// On a route change (UX-6, CH-14): scroll to the top, move focus to the page's h1 so a
// screen reader starts at the new page, and set document.title from that heading.
// The h1 comes from <PageHeader> (data-page-title, tabIndex -1). Screens that load
// their data first render it a moment later, so we wait for it briefly.

const SUFFIX = "Deis";
const WAIT_MS = 1500;

function pageTitle(main: HTMLElement | null): HTMLElement | null {
  return main?.querySelector<HTMLElement>("[data-page-title]") ?? main?.querySelector<HTMLElement>("h1") ?? null;
}

/**
 * key: anything that changes with the route (e.g. the hash). fallbackTitle: used for
 * document.title until a heading appears. The first render only sets the title: focus
 * stays where the browser put it on page load.
 */
export function useRouteFocus(mainRef: React.RefObject<HTMLElement | null>, key: string, fallbackTitle: string) {
  const first = useRef(true);
  useEffect(() => {
    const isFirst = first.current;
    first.current = false;
    document.title = `${fallbackTitle} · ${SUFFIX}`;
    if (!isFirst) window.scrollTo({ top: 0 });

    // Full-screen routes (Welcome, check-in) render their own <main> outside the shell.
    const root = () => mainRef.current ?? document.querySelector<HTMLElement>("main");
    let done = false;
    const settle = () => {
      const h = pageTitle(root());
      if (!h) return false;
      const text = h.textContent?.replace(/\s+/g, " ").trim();
      if (text) document.title = `${text} · ${SUFFIX}`;
      if (!isFirst) {
        if (!h.hasAttribute("tabindex")) h.tabIndex = -1;
        h.focus({ preventScroll: true });
      }
      return true;
    };
    if (settle()) return;

    const el = root();
    if (!el) return;
    const obs = new MutationObserver(() => {
      if (!done && settle()) {
        done = true;
        obs.disconnect();
      }
    });
    obs.observe(el, { childList: true, subtree: true });
    const t = setTimeout(() => {
      obs.disconnect();
      // No heading in time: focus <main> itself so keyboard users still start at the content.
      if (!done && !isFirst) root()?.focus({ preventScroll: true });
    }, WAIT_MS);
    return () => {
      done = true;
      obs.disconnect();
      clearTimeout(t);
    };
  }, [key, fallbackTitle, mainRef]);
}
