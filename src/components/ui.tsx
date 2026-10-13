"use client";

import { X } from "@phosphor-icons/react";
import { useEffect, useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useDialog } from "@/lib/client/useDialog";

// The few building blocks every screen uses. One radius rule: controls 10px,
// surfaces 16px. Buttons press down 1px. Every control has a visible label.

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-110 disabled:opacity-50",
  secondary: "bg-surface text-ink border border-line hover:border-ink-3 disabled:opacity-50",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-2 disabled:opacity-50",
  danger: "bg-surface text-brick border border-line hover:border-brick disabled:opacity-50",
};

export function Button({ variant = "secondary", size = "md", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sizing = size === "sm" ? "h-9 px-3 text-sm" : size === "lg" ? "h-12 px-5 text-base" : "h-11 px-4 text-[15px]";
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-[transform,filter,background-color,border-color] active:translate-y-px disabled:cursor-not-allowed ${sizing} ${VARIANT[variant]} ${className}`}
    />
  );
}

export function LinkButton({ href, children, variant = "secondary", className = "" }: { href: string; children: ReactNode; variant?: Variant; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={`inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-control px-4 text-[15px] font-medium transition active:translate-y-px ${VARIANT[variant]} ${className}`}>
      {children}
    </a>
  );
}

/** A toggle choice: aria-pressed, so screen readers say "selected". */
export function Chip({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-11 rounded-control border px-4 py-2 text-left text-[15px] transition active:translate-y-px disabled:opacity-40 ${on ? "border-accent bg-accent-soft text-accent-text font-medium" : "border-line bg-surface text-ink hover:border-ink-3"}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, help, error, children }: { label: string; help?: ReactNode; error?: string | null; children: (id: string, describedBy: string | undefined) => ReactNode }) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children(id, [helpId, errId].filter(Boolean).join(" ") || undefined)}
      {help && (
        <p id={helpId} className="text-sm text-ink-2">
          {help}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-sm text-brick">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass = "h-11 w-full rounded-control border border-line bg-surface px-3 text-[15px] text-ink placeholder:text-ink-3 focus:border-accent";
export const textareaClass = "w-full rounded-control border border-line bg-surface px-3 py-2 text-[15px] leading-relaxed text-ink placeholder:text-ink-3 focus:border-accent";

export function Notice({ tone = "info", children, className = "" }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode; className?: string }) {
  const tones = {
    info: "bg-surface-2 text-ink",
    warn: "bg-amber-soft text-ink",
    error: "bg-brick-soft text-ink",
    ok: "bg-accent-soft text-ink",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-control px-4 py-3 text-[15px] ${tones[tone]} ${className}`}>
      {children}
    </div>
  );
}

export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useDialog<HTMLDivElement>(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[rgb(10_13_12/0.55)] p-0 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-surface bg-surface p-6 shadow-lift sm:rounded-surface ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-xl font-bold">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-m-2 rounded-control p-2 text-ink-2 hover:bg-surface-2 hover:text-ink">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** "12 s": a ticking clock for long model calls, so a slow laptop doesn't look frozen. */
export function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="num">{Math.max(0, Math.round((now - since) / 1000))} s</span>;
}
