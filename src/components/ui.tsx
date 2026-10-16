"use client";

import { Check, CheckCircle, Info, Path, Warning, WarningOctagon, X } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useDialog } from "@/lib/client/useDialog";

// Deis's building blocks, "Estuary paper". Every screen uses these rather than its own.
// Documented with examples in docs/DESIGN.md. Rules: controls 10px, surfaces 16px, the job
// card 20px (round buttons and pills are fully round). Green only means "go". Every control
// has a visible label or an sr-only one, and a 44px target on touch screens.

// ---------------------------------------------------------------------------- motion

/** Shared timings (brief "Motion"). Pass through useMotion().t() so reduced motion gets none. */
export const MOTION = {
  /** The next card rising into place. */
  spring: { type: "spring", stiffness: 380, damping: 32 } satisfies Transition,
  /** A card leaving the deck. */
  exit: { duration: 0.26, ease: [0.4, 0, 1, 1] } satisfies Transition,
  /** Between "How you match" lines, in seconds. */
  stagger: 0.06,
  trace: { duration: 0.15, ease: "easeOut" } satisfies Transition,
  tab: { duration: 0.12, ease: "easeOut" } satisfies Transition,
  route: { duration: 0.16, ease: "easeOut" } satisfies Transition,
  toast: { type: "spring", stiffness: 520, damping: 34, mass: 0.6 } satisfies Transition,
} as const;

/** reduce: the user asked for less motion. t(): the transition, or an instant one. Use opacity only when reduce is true. */
export function useMotion() {
  const reduce = Boolean(useReducedMotion());
  const t = useCallback((tr: Transition): Transition => (reduce ? { duration: 0 } : tr), [reduce]);
  return { reduce, t };
}

// ---------------------------------------------------------------------------- buttons

export type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  // Primary is the "go" action: one per view.
  primary: "bg-accent text-accent-ink hover:brightness-110 dark:hover:brightness-105",
  secondary: "border border-control-border bg-raised text-ink hover:bg-wash",
  ghost: "text-ink-2 hover:bg-wash hover:text-ink",
  danger: "border border-control-border bg-raised text-brick hover:border-brick hover:bg-brick-soft",
};

// sm stays 44px tall on touch screens.
const SIZE: Record<Size, string> = {
  sm: "h-9 px-3 text-body pointer-coarse:h-11",
  md: "h-11 px-4 text-body",
  lg: "h-12 px-5 text-[16px]",
};

const BASE = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-[transform,filter,background-color,border-color,color] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0";

export const buttonClass = (variant: Variant = "secondary", size: Size = "md") => `${BASE} ${SIZE[size]} ${VARIANT[variant]}`;

/** busy: shows a spinner, sets aria-busy and disables the button. */
export function Button({ variant = "secondary", size = "md", busy, className = "", children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; busy?: boolean }) {
  return (
    <button type="button" {...rest} disabled={disabled || busy} aria-busy={busy || undefined} className={`${buttonClass(variant, size)} ${className}`}>
      {busy && <Spinner />}
      {children}
    </button>
  );
}

/** An outside link styled as a button. Opens in a new tab unless external is false (hash routes). */
export function LinkButton({ href, children, variant = "secondary", size = "md", external = true, className = "", ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: Variant; size?: Size; external?: boolean }) {
  return (
    <a href={href} {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})} {...rest} className={`${buttonClass(variant, size)} ${className}`}>
      {children}
      {external && <span className="sr-only"> (opens in a new tab)</span>}
    </a>
  );
}

const ROUND: Record<44 | 48 | 56 | 64, string> = { 44: "size-11", 48: "size-12", 56: "size-14", 64: "size-16" };

/** A round icon button: the deck's Skip (56), Later (48), Apply (64) and Undo (44). label is read out and shown as a tooltip. */
export function IconButton({
  label,
  size = 44,
  variant = "secondary",
  className = "",
  children,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & { label: string; size?: 44 | 48 | 56 | 64; variant?: Variant }) {
  return (
    <button
      type="button"
      title={label}
      {...rest}
      className={`inline-flex shrink-0 items-center justify-center rounded-full transition-[transform,filter,background-color,border-color,box-shadow] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${ROUND[size]} ${VARIANT[variant]} ${variant === "ghost" ? "" : "shadow-card"} ${className}`}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" className={`animate-spin motion-reduce:animate-none ${className}`}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------- choices

/** A toggle choice (aria-pressed). Selected: ink border and a check, never a green fill. */
export function Chip({ on, onClick, children, disabled, className = "" }: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-2.5 rounded-control border bg-raised px-3.5 py-2 text-left text-body text-ink transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${on ? "border-ink font-medium shadow-[inset_0_0_0_1px_var(--ink)]" : "border-control-border hover:bg-wash"} ${className}`}
    >
      <span aria-hidden className={`grid size-[18px] shrink-0 place-items-center rounded-full border ${on ? "border-ink bg-ink text-bg" : "border-control-border"}`}>
        {on && <Check size={12} weight="bold" />}
      </span>
      <span className="min-w-0">{children}</span>
    </button>
  );
}

/** An on/off setting (role="switch"). The label is visible; description is optional help text. */
export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (on: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
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
        className={`relative inline-flex h-11 w-[52px] shrink-0 items-center rounded-full disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span aria-hidden className={`absolute inset-x-0 top-1/2 h-7 -translate-y-1/2 rounded-full border transition-colors ${checked ? "border-ink bg-ink" : "border-control-border bg-raised"}`} />
        <span aria-hidden className={`absolute top-1/2 size-5 -translate-y-1/2 rounded-full transition-[left,background-color] ${checked ? "left-[28px] bg-bg" : "left-1 bg-ink-3"}`} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------- forms

export function Field({ label, help, error, children }: { label: ReactNode; help?: ReactNode; error?: string | null; children: (id: string, describedBy: string | undefined) => ReactNode }) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-body font-medium text-ink">
        {label}
      </label>
      {children(id, [helpId, errId].filter(Boolean).join(" ") || undefined)}
      {help && (
        <p id={helpId} className="text-caption text-ink-2">
          {help}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-caption font-medium text-brick">
          {error}
        </p>
      )}
    </div>
  );
}

// --control-border is 3:1 against the page (WCAG 1.4.11); focus keeps the global ring.
const CONTROL = "w-full rounded-control border border-control-border bg-raised text-body text-ink placeholder:text-ink-3 hover:border-ink-3 focus:border-ink aria-invalid:border-brick disabled:cursor-not-allowed disabled:opacity-60";
export const inputClass = `h-11 px-3 ${CONTROL}`;
export const textareaClass = `px-3 py-2 leading-relaxed ${CONTROL}`;
export const selectClass = `h-11 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10 pl-3 ${CONTROL} bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cpath fill='%23878c86' d='M213.66 101.66l-80 80a8 8 0 0 1-11.32 0l-80-80a8 8 0 0 1 11.32-11.32L128 164.69l74.34-74.35a8 8 0 0 1 11.32 11.32Z'/%3E%3C/svg%3E")]`;

// ---------------------------------------------------------------------------- notices and pills

export type Tone = "info" | "warn" | "error" | "ok" | "trace";

const NOTICE: Record<Tone, { box: string; bar: string; icon: string; Icon: typeof Info }> = {
  info: { box: "bg-surface border border-line", bar: "before:bg-ink-3", icon: "text-ink-2", Icon: Info },
  warn: { box: "bg-ochre-soft", bar: "before:bg-ochre", icon: "text-ochre", Icon: Warning },
  error: { box: "bg-brick-soft", bar: "before:bg-brick", icon: "text-brick", Icon: WarningOctagon },
  ok: { box: "bg-accent-soft", bar: "before:bg-accent", icon: "text-accent-text", Icon: CheckCircle },
  trace: { box: "bg-trace-soft", bar: "before:bg-trace", icon: "text-trace", Icon: Path },
};

/**
 * A message in the page: left icon, 3px coloured left border, ink text.
 * Errors are role="alert"; the rest role="status" unless announce is false (static copy).
 */
export function Notice({ tone = "info", title, children, action, className = "", announce = true }: { tone?: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string; announce?: boolean }) {
  const t = NOTICE[tone];
  const role = tone === "error" ? "alert" : announce ? "status" : undefined;
  return (
    <div role={role} className={`relative flex gap-3 overflow-hidden rounded-control py-3 pr-4 pl-4 text-body text-ink before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${t.box} ${t.bar} ${className}`}>
      <t.Icon size={20} weight="fill" aria-hidden className={`mt-0.5 shrink-0 ${t.icon}`} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={title ? "mt-0.5 text-ink-2" : ""}>{children}</div>}
        {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

export type PillTone = "neutral" | "go" | "trace" | "ochre" | "brick";

const PILL: Record<PillTone, string> = {
  neutral: "border border-line bg-surface text-ink-2",
  go: "bg-accent-soft text-accent-text",
  trace: "bg-trace-soft text-trace",
  ochre: "bg-ochre-soft text-ochre",
  brick: "bg-brick-soft text-brick",
};

/** A short label: "Early career" (neutral), "Strong match" (go), "Stretch" (ochre), "Blocked" (brick), "3 sources" (trace). */
export function Pill({ tone = "neutral", icon, children, className = "", ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: PillTone; icon?: ReactNode }) {
  return (
    <span {...rest} className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-caption font-medium whitespace-nowrap ${PILL[tone]} ${className}`}>
      {icon}
      {children}
    </span>
  );
}
export const Badge = Pill;

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex min-w-6 items-center justify-center rounded-control border border-control-border bg-raised px-1.5 font-mono text-caption text-ink-2 shadow-[0_1px_0_var(--line)]">{children}</kbd>;
}

// ---------------------------------------------------------------------------- surfaces and layout

/** A paper surface. raised: white with the card shadow (cards, sheets); default: the quieter surface with a hairline. */
export function Surface({ raised, className = "", children, ...rest }: HTMLAttributes<HTMLDivElement> & { raised?: boolean }) {
  return (
    <div {...rest} className={`rounded-surface ${raised ? "bg-raised shadow-card" : "border border-line bg-surface"} ${className}`}>
      {children}
    </div>
  );
}

/** The Irish eyebrows over each page title. The first four are the brief's; the rest follow the same pattern. */
export const EYEBROW = {
  deck: "Poist",
  tracker: "Iarratais",
  application: "Iarratas",
  profile: "Próifíl",
  settings: "Socruithe",
  model: "Samhail",
  licence: "Ceadúnas",
  welcome: "Fáilte",
} as const;

/**
 * Every screen's title block. The Irish eyebrow is aria-hidden (screen readers hear the English
 * title only). The h1 takes focus on a route change (useRouteFocus) and names document.title.
 */
export function PageHeader({ eyebrow, title, description, actions, className = "" }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={`mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 lg:mb-8 ${className}`}>
      <div className="min-w-0 max-w-[68ch]">
        {eyebrow && (
          <p aria-hidden="true" lang="ga" className="eyebrow mb-1">
            {eyebrow}
          </p>
        )}
        <h1 data-page-title tabIndex={-1} className="display text-title text-ink text-balance sm:text-page">
          {title}
        </h1>
        {description && <div className="mt-2 text-body text-ink-2 sm:text-[16px]">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A titled section inside a page: h2 in Atkinson bold 18, optional description and actions. */
export function Section({ title, description, actions, children, className = "" }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={`grid gap-4 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={id} className="text-lead font-bold text-ink">
            {title}
          </h2>
          {description && <div className="mt-1 max-w-[64ch] text-body text-ink-2">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------- loading and empty

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

/** A page-shaped placeholder: eyebrow, title and a few blocks. Announces "Loading" once. */
export function PageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      <Skeleton className="mb-2 h-3 w-16" />
      <Skeleton className="h-8 w-64 max-w-full sm:h-10" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid gap-3">
        <Skeleton className="h-28 w-full rounded-surface" />
        <Skeleton className="h-28 w-full rounded-surface" />
      </div>
    </div>
  );
}

/** Nothing here yet: an icon, a display title, one sentence and one action. */
export function EmptyState({ icon, title, children, action, className = "" }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`grid justify-items-center gap-3 rounded-surface border border-dashed border-control-border bg-surface px-6 py-12 text-center ${className}`}>
      {icon && (
        <div aria-hidden className="grid size-12 place-items-center rounded-full bg-wash text-ink-2">
          {icon}
        </div>
      )}
      <p className="display text-title text-ink">{title}</p>
      {children && <div className="max-w-[48ch] text-body text-ink-2">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** "12 s": a ticking clock for long model calls. aria-hidden: announce the start and the finish elsewhere, never each second. */
export function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span aria-hidden="true" className="num">
      {Math.max(0, Math.round((now - since) / 1000))} s
    </span>
  );
}

// ---------------------------------------------------------------------------- meters and steps

const BAR: Record<PillTone, string> = { neutral: "bg-ink-3", go: "bg-accent", trace: "bg-trace", ochre: "bg-ochre", brick: "bg-brick" };

/** One labelled bar: "Needs 3+ years · 12". The text carries the value; the bar is decoration. */
export function Meter({ label, value, max, tone = "neutral", detail }: { label: ReactNode; value: number; max: number; tone?: PillTone; detail?: ReactNode }) {
  const pct = max > 0 ? Math.min(100, Math.max(value > 0 ? 3 : 0, (value / max) * 100)) : 0;
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3 text-body">
        <span className="min-w-0 text-ink">{label}</span>
        <span className="display num shrink-0 text-lead text-ink">{value}</span>
      </div>
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-wash">
        <div className={`h-full rounded-full ${BAR[tone]}`} style={{ width: `${pct}%` }} />
      </div>
      {detail && <p className="text-caption text-ink-2">{detail}</p>}
    </div>
  );
}

/** Bars for a breakdown, e.g. the deck's hidden-for-you reasons. max defaults to the largest value. */
export function BarList({ items, max, className = "" }: { items: { key: string; label: ReactNode; value: number; tone?: PillTone; detail?: ReactNode }[]; max?: number; className?: string }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className={`grid gap-3 ${className}`}>
      {items.map((i) => (
        <li key={i.key}>
          <Meter label={i.label} value={i.value} max={top} tone={i.tone} detail={i.detail} />
        </li>
      ))}
    </ul>
  );
}

/** A segmented progress bar for steps (the check-in). current is 1-based. */
export function StepBar({ total, current, label = "Progress" }: { total: number; current: number; label?: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={1} aria-valuemax={total} aria-valuenow={current} aria-valuetext={`Step ${current} of ${total}`} className="flex gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} aria-hidden className={`h-1.5 flex-1 rounded-full transition-colors ${i < current ? "bg-ink" : "bg-line"}`} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------- tabs

export type TabItem = { id: string; label: ReactNode; content: ReactNode; badge?: ReactNode; disabled?: boolean };

/**
 * WAI-ARIA tabs: a tablist of tabs, one tabpanel. Arrow keys move and select (wrapping),
 * Home and End jump; only the selected tab is in the Tab order. Panels cross-fade in 120 ms.
 * Controlled (value + onChange) or not (defaultValue). keepMounted keeps hidden panels' state.
 */
export function Tabs({
  label,
  items,
  value,
  defaultValue,
  onChange,
  keepMounted,
  className = "",
  listClassName = "",
  panelClassName = "",
}: {
  label: string;
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  keepMounted?: boolean;
  className?: string;
  listClassName?: string;
  panelClassName?: string;
}) {
  const base = useId();
  const [inner, setInner] = useState(defaultValue ?? items[0]?.id);
  const active = value ?? inner;
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const { t } = useMotion();
  const select = (id: string) => {
    if (value === undefined) setInner(id);
    onChange?.(id);
  };
  const enabled = items.filter((i) => !i.disabled);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = enabled.findIndex((i) => i.id === active);
    let next = -1;
    if (e.key === "ArrowRight") next = (at + 1) % enabled.length;
    else if (e.key === "ArrowLeft") next = (at - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = enabled.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const id = enabled[next].id;
    select(id);
    refs.current.get(id)?.focus();
  };

  const tabId = (id: string) => `${base}-tab-${id}`;
  const panelId = (id: string) => `${base}-panel-${id}`;
  const current = items.find((i) => i.id === active) ?? items[0];

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} onKeyDown={onKey} className={`flex gap-1 overflow-x-auto border-b border-line ${listClassName}`}>
        {items.map((i) => {
          const on = i.id === current?.id;
          return (
            <button
              key={i.id}
              ref={(el) => {
                if (el) refs.current.set(i.id, el);
                else refs.current.delete(i.id);
              }}
              type="button"
              role="tab"
              id={tabId(i.id)}
              aria-selected={on}
              aria-controls={panelId(i.id)}
              tabIndex={on ? 0 : -1}
              disabled={i.disabled}
              onClick={() => select(i.id)}
              className={`relative -mb-px inline-flex min-h-11 shrink-0 items-center gap-2 px-3 text-body transition-colors disabled:opacity-50 ${on ? "font-bold text-ink" : "text-ink-2 hover:text-ink"}`}
            >
              {i.label}
              {i.badge}
              <span aria-hidden className={`absolute inset-x-2 bottom-0 h-[3px] rounded-full transition-colors ${on ? "bg-ink" : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>
      {keepMounted ? (
        items.map((i) => (
          <div key={i.id} role="tabpanel" id={panelId(i.id)} aria-labelledby={tabId(i.id)} tabIndex={0} hidden={i.id !== current?.id} className={panelClassName}>
            {i.content}
          </div>
        ))
      ) : current ? (
        <motion.div key={current.id} role="tabpanel" id={panelId(current.id)} aria-labelledby={tabId(current.id)} tabIndex={0} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={t(MOTION.tab)} className={panelClassName}>
          {current.content}
        </motion.div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------- dialog

/**
 * A modal dialog: a bottom sheet on phones, centred from sm up. Focus is trapped (useDialog),
 * Escape and the scrim close it. footer: actions pinned to the bottom of the sheet.
 */
export function Dialog({ open, onClose, title, description, children, footer, wide }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useDialog<HTMLDivElement>(open, onClose);
  const titleId = useId();
  const descId = useId();
  const { reduce, t } = useMotion();
  if (!open || typeof document === "undefined") return null;
  // Portalled to <body> so no parent's stacking context (the route fade, a sticky toolbar) can put it under the nav.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-scrim sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={t({ duration: 0.18, ease: [0.22, 1, 0.36, 1] })}
        className={`flex max-h-[92dvh] w-full flex-col rounded-t-surface bg-raised shadow-lift sm:rounded-surface ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
      >
        <div className="overflow-y-auto px-5 pt-3 pb-5 sm:px-6 sm:pt-6">
          <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" />
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id={titleId} className="display text-title text-ink">
                {title}
              </h2>
              {description && (
                <div id={descId} className="mt-1 text-body text-ink-2">
                  {description}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} className="-m-1 grid size-11 shrink-0 place-items-center rounded-control text-ink-2 hover:bg-wash hover:text-ink">
              <X size={20} aria-hidden />
              <span className="sr-only">Close</span>
            </button>
          </div>
          {children}
        </div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">{footer}</div>}
      </motion.div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------- toasts

export type ToastInput = {
  message: string;
  /** Shows an Undo button; the toast closes when it's pressed. */
  undo?: () => void | Promise<void>;
  /** Another single action instead of Undo. */
  action?: { label: string; run: () => void | Promise<void> };
  /** ms before it goes; default 5 s, 8 s with an action. 0 keeps it until closed. */
  duration?: number;
};
type ToastItem = ToastInput & { id: number };

let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Show a toast from anywhere: toast("Saved") or toast({ message: "Skipped", undo }). Returns its id. */
export function toast(input: string | ToastInput): number {
  const t: ToastItem = { ...(typeof input === "string" ? { message: input } : input), id: nextId++ };
  toasts = [...toasts.slice(-2), t];
  emit();
  return t.id;
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const EMPTY: ToastItem[] = [];

/** Mounted once by the shell. Inverse colours; sits above the mobile nav; one polite live region. */
export function Toaster() {
  const items = useSyncExternalStore(
    subscribe,
    () => toasts,
    () => EMPTY,
  );
  const { reduce, t } = useMotion();
  return (
    <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.div
            key={item.id}
            layout={!reduce}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={t(MOTION.toast)}
            className="pointer-events-auto"
          >
            <ToastView item={item} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastView({ item }: { item: ToastItem }) {
  const [paused, setPaused] = useState(false);
  const action = item.undo ? { label: "Undo", run: item.undo } : item.action;
  const duration = item.duration ?? (action ? 8000 : 5000);
  useEffect(() => {
    if (paused || duration === 0) return;
    const timer = setTimeout(() => dismissToast(item.id), duration);
    return () => clearTimeout(timer);
  }, [paused, duration, item.id]);
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="flex max-w-[min(92vw,520px)] items-center gap-3 rounded-control bg-ink py-2 pr-2 pl-4 text-body text-bg shadow-lift"
    >
      <span className="min-w-0 flex-1 py-1.5">{item.message}</span>
      {action && (
        <button
          type="button"
          onClick={async () => {
            dismissToast(item.id);
            await action.run();
          }}
          className="h-9 shrink-0 rounded-control px-3 font-bold underline underline-offset-2 hover:bg-[color-mix(in_oklab,var(--bg)_14%,transparent)] focus-visible:outline-[var(--bg)] pointer-coarse:h-11"
        >
          {action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => dismissToast(item.id)}
        className="grid size-9 shrink-0 place-items-center rounded-control hover:bg-[color-mix(in_oklab,var(--bg)_14%,transparent)] focus-visible:outline-[var(--bg)] pointer-coarse:size-11"
      >
        <X size={16} aria-hidden />
        <span className="sr-only">Dismiss</span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------- brand

/** "Deis" in Newsreader italic with OPPORTUNITY in small tracked capitals, after the Irish road-sign convention. */
export function Wordmark({ large }: { large?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span lang="ga" className={`ga leading-none text-ink ${large ? "text-[56px]" : "text-[28px]"}`}>
        Deis
      </span>
      <span className={`uppercase tracking-[0.16em] text-ink-3 ${large ? "text-caption" : "text-[11px]"}`}>Opportunity</span>
    </span>
  );
}
