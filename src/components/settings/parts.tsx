"use client";

import { Check, CloudArrowUp, Copy, Laptop } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useId, useState, type ReactNode } from "react";
import type { Privacy } from "@/lib/client/model";
import { Pill, useMotion } from "../ui";

// Small pieces shared by Settings and the model chooser.

/**
 * A settings section: at large widths the heading and its description sit in a left
 * column and the controls on the right, so a long page scans as a list of topics.
 */
export function SettingsSection({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-4 border-t border-line pt-8 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:gap-12">
      <div className="min-w-0 lg:sticky lg:top-[calc(var(--top-bar)+1.5rem)] lg:self-start">
        <h2 id={id} className="text-lead font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {description && <div className="mt-1.5 max-w-[64ch] text-body text-ink-2">{description}</div>}
      </div>
      <div className="grid min-w-0 content-start gap-4">{children}</div>
    </section>
  );
}

/** "Stays on this computer" or "Sent to …": where the facts go with this model. */
export function PrivacyBadge({ privacy }: { privacy: Privacy }) {
  const local = privacy.where === "this computer";
  const Icon = local ? Laptop : CloudArrowUp;
  return (
    <Pill icon={<Icon size={14} aria-hidden />} className="max-w-full whitespace-normal">
      {privacy.badge}
    </Pill>
  );
}

/** A command to copy into a terminal, with a Copy button that says when it worked. */
export function CopyLine({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-pill bg-sunken py-1 pr-1 pl-4">
      <code className="min-w-0 overflow-x-auto font-mono text-caption whitespace-nowrap text-ink">{text}</code>
      <button
        type="button"
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-pill bg-surface px-3.5 text-caption font-medium text-ink shadow-card hover:bg-bg pointer-coarse:h-11"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setDone(true);
            setTimeout(() => setDone(false), 2500);
          } catch {
            // clipboard blocked: the command is still there to select by hand
          }
        }}
      >
        {done ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
        <span aria-live="polite">{done ? "Copied" : label}</span>
        <span className="sr-only">: {text}</span>
      </button>
    </div>
  );
}

/** One line of a readiness checklist: a tick or an open circle, the words, and an optional detail. */
export function CheckItem({ ok, children, detail }: { ok: boolean | null; children: ReactNode; detail?: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${ok ? "bg-pop-soft text-ink" : ok === null ? "border border-dashed border-line" : "border border-control-border"}`}
      >
        {ok && <Check size={12} weight="bold" />}
      </span>
      <div className="grid min-w-0 flex-1 gap-1">
        <span className="text-body text-ink">
          <span className="sr-only">{ok ? "Ready: " : ok === null ? "Checking: " : "Not yet: "}</span>
          {children}
        </span>
        {detail && <div className="text-caption text-ink-2">{detail}</div>}
      </div>
    </li>
  );
}

/**
 * The Switch from ui.tsx, with a knob that springs across (MAGIC moment 5). Same contract:
 * role="switch", a visible label, optional help, on is ink.
 */
export function SpringSwitch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (on: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  const { t } = useMotion();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <span id={`${id}-l`} className="block text-body font-medium text-ink">
          {label}
        </span>
        {description && (
          <span id={`${id}-d`} className="mt-0.5 block text-caption text-ink-2">
            {description}
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="group relative inline-flex h-11 w-[52px] shrink-0 items-center rounded-full disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span aria-hidden className={`absolute inset-x-0 top-1/2 h-7 -translate-y-1/2 rounded-full border transition-colors duration-200 ${checked ? "border-ink bg-ink" : "border-control-border bg-sunken"}`} />
        <motion.span
          aria-hidden
          className={`absolute top-1/2 left-1 -mt-2.5 size-5 rounded-full shadow-[0_1px_2px_rgb(14_15_16/0.2)] transition-colors duration-200 ${checked ? "bg-surface" : "bg-ink-3"}`}
          initial={false}
          animate={{ x: checked ? 24 : 0 }}
          whileTap={{ scaleX: 1.25 }}
          transition={t({ type: "spring", stiffness: 700, damping: 30 })}
        />
      </button>
    </div>
  );
}
