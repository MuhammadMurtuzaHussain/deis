"use client";

import { Check, CloudArrowUp, Copy, Laptop } from "@phosphor-icons/react";
import { useId, useState, type ReactNode } from "react";
import type { Privacy } from "@/lib/client/model";
import { Pill } from "../ui";

// Small pieces shared by Settings and the model chooser.

/**
 * A settings section: at large widths the heading and its description sit in a left
 * column and the controls on the right, so a long page scans as a list of topics.
 */
export function SettingsSection({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-4 border-t border-line pt-8 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)] lg:gap-10">
      <div className="min-w-0">
        <h2 id={id} className="text-lead font-bold text-ink">
          {title}
        </h2>
        {description && <div className="mt-1 max-w-[64ch] text-body text-ink-2">{description}</div>}
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
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-control border border-line bg-wash py-1 pr-1 pl-3">
      <code className="min-w-0 overflow-x-auto font-mono text-caption whitespace-nowrap text-ink">{text}</code>
      <button
        type="button"
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control px-3 text-caption font-medium text-ink hover:bg-raised pointer-coarse:h-11"
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
        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${ok ? "border-accent bg-accent text-accent-ink" : ok === null ? "border-line" : "border-control-border"}`}
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
