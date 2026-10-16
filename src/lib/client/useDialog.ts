"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open dialogs, innermost last: only the top one answers Escape and Tab, and the page
// behind stays still until the last one closes.
const stack: symbol[] = [];

/** Escape closes, Tab stays inside, the page doesn't scroll behind, and focus goes back where it was. */
export function useDialog<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const me = Symbol("dialog");
    stack.push(me);
    const top = () => stack[stack.length - 1] === me;
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const t = setTimeout(() => {
      const el = ref.current;
      if (el && !el.contains(document.activeElement)) (el.querySelector<HTMLElement>("[autofocus]") ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el)?.focus();
    }, 50);
    const onKey = (e: KeyboardEvent) => {
      if (!top()) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!ref.current.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(me), 1);
      if (!stack.length) document.documentElement.style.overflow = overflow;
      before?.focus?.();
    };
  }, [open]);

  return ref;
}
