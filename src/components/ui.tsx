"use client";

import { Check, CheckCircle, Info, Path, Warning, WarningOctagon, X } from "@phosphor-icons/react";
import { AnimatePresence, motion, useAnimate, useReducedMotion, useSpring, useTransform, type HTMLMotionProps, type Transition } from "motion/react";
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

// Deis's building blocks, v3 "Highlighter". Every screen uses these rather than its own.
// Documented with examples in docs/DESIGN.md. Shapes: controls are full pill (textareas 16),
// containers 20, the swipe card 28, company marks 12. Lime (pop) only means "go" or
// "proven", and is never text on a light background. Every control has a visible label or
// an sr-only one, and a 44px target on touch screens.

// ---------------------------------------------------------------------------- motion

/** Shared timings (brief "Motion"). Pass through useMotion().t() so reduced motion gets none. */
export const MOTION = {
  /** The next card rising into place. */
  spring: { type: "spring", stiffness: 380, damping: 32 } satisfies Transition,
  /** A card leaving the deck. */
  exit: { duration: 0.24, ease: [0.4, 0, 1, 1] } satisfies Transition,
  /** Between "How you match" lines, in seconds. */
  stagger: 0.06,
  trace: { duration: 0.15, ease: "easeOut" } satisfies Transition,
  tab: { duration: 0.12, ease: "easeOut" } satisfies Transition,
  route: { duration: 0.14, ease: "easeOut" } satisfies Transition,
  /** The segmented nav and tab indicator sliding between items (layoutId). */
  indicator: { type: "spring", stiffness: 520, damping: 40 } satisfies Transition,
  /** The highlighter stroke drawing in; the CSS .highlight utility uses the same 220 ms. */
  highlight: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } satisfies Transition,
  toast: { type: "spring", stiffness: 520, damping: 34, mass: 0.6 } satisfies Transition,
  /** A pressable squashing on press and springing back. */
  press: { type: "spring", stiffness: 700, damping: 18, mass: 0.6 } satisfies Transition,
  /** Magnetic buttons settling back under the pointer. */
  magnet: { stiffness: 260, damping: 18, mass: 0.5 },
  /** Numbers rolling to a new value. */
  roll: { stiffness: 120, damping: 20, mass: 0.9 },
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
  // Primary is the "go" action, lime with ink text: one per view.
  primary: "bg-pop text-pop-ink hover:bg-[color-mix(in_oklab,var(--pop)_90%,var(--pop-ink))]",
  secondary: "border border-control-border bg-surface text-ink hover:bg-sunken",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
  danger: "border border-control-border bg-surface text-danger hover:border-danger hover:bg-danger-soft",
};

// sm stays 44px tall on touch screens.
const SIZE: Record<Size, string> = {
  sm: "h-9 px-4 text-body pointer-coarse:h-11",
  md: "h-11 px-5 text-body",
  lg: "h-12 px-6 text-[16px]",
};

// Shared by Button and buttonClass. Button squashes with a spring (Motion), so the CSS press
// scale is only added for links and labels styled as buttons.
const BASE = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill font-medium transition-[background-color,border-color,color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50";

export const buttonClass = (variant: Variant = "secondary", size: Size = "md") => `${BASE} transition-[transform,background-color,border-color,color] active:scale-[0.98] disabled:active:scale-100 ${SIZE[size]} ${VARIANT[variant]}`;

/**
 * Magnetism for primary buttons: the button leans up to 6 px towards a fine pointer moving over
 * it, and springs back when it leaves. Off for touch and reduced motion.
 */
function useMagnet(on: boolean) {
  const x = useSpring(0, MOTION.magnet);
  const y = useSpring(0, MOTION.magnet);
  const move = (e: { clientX: number; clientY: number; currentTarget: Element; pointerType?: string }) => {
    if (!on || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    x.set(Math.max(-6, Math.min(6, dx * 0.22)));
    y.set(Math.max(-4, Math.min(4, dy * 0.3)));
  };
  const leave = () => {
    x.set(0);
    y.set(0);
  };
  return { x, y, move, leave };
}

/** busy: shows a spinner, sets aria-busy and disables the button. Primary buttons are magnetic; every button squashes on press. */
export function Button({ variant = "secondary", size = "md", busy, className = "", children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; busy?: boolean }) {
  const { reduce, t } = useMotion();
  const off = disabled || busy;
  const magnet = useMagnet(variant === "primary" && !reduce && !off);
  return (
    <motion.button
      type="button"
      {...(rest as HTMLMotionProps<"button">)}
      disabled={off}
      aria-busy={busy || undefined}
      style={{ x: magnet.x, y: magnet.y }}
      onPointerMove={(e) => {
        magnet.move(e);
        rest.onPointerMove?.(e);
      }}
      onPointerLeave={(e) => {
        magnet.leave();
        rest.onPointerLeave?.(e);
      }}
      whileTap={reduce || off ? undefined : { scale: 0.95 }}
      transition={t(MOTION.press)}
      className={`${BASE} ${SIZE[size]} ${VARIANT[variant]} ${className}`}
    >
      {busy && <Spinner />}
      {children}
    </motion.button>
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

export type IconButtonSize = 36 | 40 | 44 | 48 | 52 | 56 | 60 | 64 | 72;
const ROUND: Record<IconButtonSize, string> = { 36: "size-9 pointer-coarse:size-11", 40: "size-10 pointer-coarse:size-11", 44: "size-11", 48: "size-12", 52: "size-13", 56: "size-14", 60: "size-15", 64: "size-16", 72: "size-18" };

/** A round icon button: the deck's Undo (44, ghost), Later (52), Skip (60) and Apply (72, primary). label is read out and shown as a tooltip. Squashes to .94 on press and springs back; primary ones are magnetic. */
export function IconButton({
  label,
  size = 44,
  variant = "secondary",
  className = "",
  children,
  disabled,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & { label: string; size?: IconButtonSize; variant?: Variant }) {
  const { reduce, t } = useMotion();
  const magnet = useMagnet(variant === "primary" && !reduce && !disabled);
  return (
    <motion.button
      type="button"
      title={label}
      {...(rest as HTMLMotionProps<"button">)}
      disabled={disabled}
      style={{ x: magnet.x, y: magnet.y }}
      onPointerMove={(e) => {
        magnet.move(e);
        rest.onPointerMove?.(e);
      }}
      onPointerLeave={(e) => {
        magnet.leave();
        rest.onPointerLeave?.(e);
      }}
      whileTap={reduce || disabled ? undefined : { scale: 0.94 }}
      transition={t(MOTION.press)}
      className={`inline-flex shrink-0 items-center justify-center rounded-full transition-[filter,background-color,border-color,box-shadow,color] disabled:cursor-not-allowed disabled:opacity-50 ${ROUND[size]} ${VARIANT[variant]} ${variant === "ghost" ? "" : "shadow-card"} ${className}`}
    >
      {children}
      <span className="sr-only">{label}</span>
    </motion.button>
  );
}

/**
 * A count that rolls to its new value on a spring when it changes (deck matches, n of N,
 * tracker counts, the ready count, the checks counter). The rolling figures are aria-hidden;
 * screen readers get the final value. Reduced motion: the new value at once.
 * from: roll up from this on first render (e.g. 0), instead of starting at value.
 */
export function RollingNumber({ value, from, className = "", format }: { value: number; from?: number; className?: string; format?: (n: number) => string }) {
  const { reduce } = useMotion();
  const fmt = format ?? ((n: number) => Math.round(n).toLocaleString("en-IE"));
  const spring = useSpring(reduce ? value : (from ?? value), MOTION.roll);
  const text = useTransform(spring, (v) => fmt(v));
  useEffect(() => {
    if (reduce) spring.jump(value);
    else spring.set(value);
  }, [value, reduce, spring]);
  return (
    <span className={`num inline-block ${className}`}>
      <motion.span aria-hidden>{text}</motion.span>
      <span className="sr-only">{fmt(value)}</span>
    </span>
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

/** A toggle choice (aria-pressed), a pill. Selected: ink fill (scaling in on a spring), surface text and a check; never lime. */
export function Chip({ on, onClick, children, disabled, className = "" }: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean; className?: string }) {
  const { reduce, t } = useMotion();
  return (
    <motion.button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      whileTap={reduce || disabled ? undefined : { scale: 0.95 }}
      transition={t(MOTION.press)}
      className={`relative isolate inline-flex min-h-11 items-center gap-2 overflow-hidden rounded-pill border py-2 pr-4 pl-3 text-left text-body transition-[border-color,color] disabled:cursor-not-allowed disabled:opacity-50 ${on ? "border-ink font-medium text-surface" : "border-control-border bg-surface text-ink hover:bg-sunken"} ${className}`}
    >
      <AnimatePresence initial={false}>
        {on && (
          <motion.span
            key="fill"
            aria-hidden
            initial={reduce ? { opacity: 0 } : { scale: 0.4, opacity: 0.4 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
            transition={t({ type: "spring", stiffness: 520, damping: 30 })}
            className="absolute inset-0 -z-10 rounded-pill bg-ink"
          />
        )}
      </AnimatePresence>
      <span aria-hidden className={`grid size-[18px] shrink-0 place-items-center rounded-full border transition-colors ${on ? "border-surface bg-surface text-ink" : "border-control-border"}`}>
        <AnimatePresence initial={false}>
          {on && (
            <motion.span key="check" initial={reduce ? { opacity: 0 } : { scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ opacity: 0, scale: 0 }} transition={t({ type: "spring", stiffness: 600, damping: 22, delay: 0.04 })} className="grid">
              <Check size={12} weight="bold" />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className="min-w-0">{children}</span>
    </motion.button>
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
        <span aria-hidden className={`absolute inset-x-0 top-1/2 h-7 -translate-y-1/2 rounded-full border transition-colors ${checked ? "border-ink bg-ink" : "border-control-border bg-sunken"}`} />
        <span aria-hidden className={`absolute top-1/2 size-5 -translate-y-1/2 rounded-full shadow-[0_1px_2px_rgb(14_15_16/0.2)] transition-[left,background-color] ${checked ? "left-[28px] bg-surface" : "left-1 bg-ink-3"}`} />
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
        <p id={errId} role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// --control-border is 3:1 against the page (WCAG 1.4.11); focus keeps the global ring.
// Inputs and selects are pills; multi-line textareas are 16.
const CONTROL = "w-full border border-control-border bg-surface text-body text-ink placeholder:text-ink-3 hover:border-ink-3 focus:border-ink aria-invalid:border-danger disabled:cursor-not-allowed disabled:opacity-60";
export const inputClass = `h-11 rounded-pill px-4 ${CONTROL}`;
export const textareaClass = `rounded-field px-4 py-3 leading-relaxed ${CONTROL}`;
export const selectClass = `h-11 appearance-none rounded-pill bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10 pl-4 ${CONTROL} bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cpath fill='%238C8F94' d='M213.66 101.66l-80 80a8 8 0 0 1-11.32 0l-80-80a8 8 0 0 1 11.32-11.32L128 164.69l74.34-74.35a8 8 0 0 1 11.32 11.32Z'/%3E%3C/svg%3E")]`;

// ---------------------------------------------------------------------------- notices and pills

export type Tone = "info" | "warn" | "error" | "ok" | "trace";

const NOTICE: Record<Tone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: "border border-line bg-surface", icon: "text-ink-2", Icon: Info },
  warn: { box: "bg-warn-soft", icon: "text-warn", Icon: Warning },
  error: { box: "bg-danger-soft", icon: "text-danger", Icon: WarningOctagon },
  ok: { box: "bg-pop-soft", icon: "text-ink", Icon: CheckCircle },
  trace: { box: "bg-pop-soft", icon: "text-ink", Icon: Path },
};

/**
 * A message in the page: a tinted panel (radius 20), left icon, ink text.
 * Errors are role="alert"; the rest role="status" unless announce is false (static copy).
 */
export function Notice({ tone = "info", title, children, action, className = "", announce = true }: { tone?: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string; announce?: boolean }) {
  const t = NOTICE[tone];
  const role = tone === "error" ? "alert" : announce ? "status" : undefined;
  return (
    <div role={role} className={`flex gap-3 rounded-panel px-4 py-3 text-body text-ink ${t.box} ${className}`}>
      <t.Icon size={20} weight="fill" aria-hidden className={`mt-0.5 shrink-0 ${t.icon}`} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5 text-ink-2" : ""}>{children}</div>}
        {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

/** neutral, go (pop-soft with ink text), warn, danger. trace, ochre and brick are deprecated v2 names for go, warn and danger. */
export type PillTone = "neutral" | "go" | "warn" | "danger" | "trace" | "ochre" | "brick";

const PILL: Record<PillTone, string> = {
  neutral: "border border-line bg-surface text-ink-2",
  go: "bg-pop-soft text-ink",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  trace: "bg-pop-soft text-ink",
  ochre: "bg-warn-soft text-warn",
  brick: "bg-danger-soft text-danger",
};

/** A short label: "Early career" (neutral), "Strong match" (go), "Stretch" (warn), "Blocked" (danger). */
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
  return <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-pill border border-line bg-surface px-2 font-mono text-[12px] text-ink-2">{children}</kbd>;
}

// ---------------------------------------------------------------------------- surfaces and layout

/** A panel (radius 20). raised: the card shadow (sheets, floating panels); default: a hairline. */
export function Surface({ raised, className = "", children, ...rest }: HTMLAttributes<HTMLDivElement> & { raised?: boolean }) {
  return (
    <div {...rest} className={`rounded-panel bg-surface ${raised ? "shadow-card" : "border border-line"} ${className}`}>
      {children}
    </div>
  );
}

/**
 * Every screen's title block: an h1 in Bricolage 800 (28 on phones, 36 from sm), no eyebrow.
 * The h1 takes focus on a route change (useRouteFocus) and names document.title.
 */
export function PageHeader({ title, description, actions, className = "" }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={`mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 lg:mb-8 ${className}`}>
      <div className="min-w-0 max-w-[65ch]">
        <h1 data-page-title tabIndex={-1} className="display text-[28px] leading-[1.1] text-ink text-balance sm:text-page">
          {title}
        </h1>
        {description && <div className="mt-2 text-body text-ink-2">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A titled section inside a page: h2 in Geist semibold 18, optional description and actions. */
export function Section({ title, description, actions, children, className = "" }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={`grid gap-4 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={id} className="text-lead font-semibold tracking-[-0.01em] text-ink">
            {title}
          </h2>
          {description && <div className="mt-1 max-w-[65ch] text-body text-ink-2">{description}</div>}
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

/** A page-shaped placeholder: a title and a few blocks. Announces "Loading" once. */
export function PageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      <Skeleton className="h-8 w-64 max-w-full sm:h-10" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid gap-3">
        <Skeleton className="h-28 w-full rounded-panel" />
        <Skeleton className="h-28 w-full rounded-panel" />
      </div>
    </div>
  );
}

/** Nothing here yet: an icon, a big Bricolage line, one sentence and one action. */
export function EmptyState({ icon, title, children, action, className = "" }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`grid justify-items-center gap-3 rounded-panel border border-line bg-surface px-6 py-12 text-center ${className}`}>
      {icon && (
        <div aria-hidden className="grid size-12 place-items-center rounded-full bg-sunken text-ink-2">
          {icon}
        </div>
      )}
      <p className="display text-[28px] leading-[1.1] text-ink text-balance">{title}</p>
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

// Bars are data, not "go": the go tone is ink, never lime.
const BAR: Record<PillTone, string> = { neutral: "bg-ink-3", go: "bg-ink", warn: "bg-warn", danger: "bg-danger", trace: "bg-ink", ochre: "bg-warn", brick: "bg-danger" };

/** One labelled bar: "Needs 3+ years · 12". The text carries the value; the bar is decoration. */
export function Meter({ label, value, max, tone = "neutral", detail }: { label: ReactNode; value: number; max: number; tone?: PillTone; detail?: ReactNode }) {
  const pct = max > 0 ? Math.min(100, Math.max(value > 0 ? 3 : 0, (value / max) * 100)) : 0;
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3 text-body">
        <span className="min-w-0 text-ink">{label}</span>
        <span className="num shrink-0 font-mono text-body text-ink">{value}</span>
      </div>
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-sunken">
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
 * WAI-ARIA tabs as a segmented pill: a tablist of tabs, one tabpanel. The selected tab sits on an
 * ink pill that slides between tabs (Motion layoutId). Arrow keys move and select (wrapping),
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
      <div role="tablist" aria-label={label} onKeyDown={onKey} className={`inline-flex max-w-full gap-1 overflow-x-auto rounded-pill bg-sunken p-1 ${listClassName}`}>
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
              className={`relative inline-flex h-9 shrink-0 items-center gap-2 rounded-pill px-4 text-body font-medium transition-colors disabled:opacity-50 pointer-coarse:h-11 ${on ? "text-surface" : "text-ink-2 hover:text-ink"}`}
            >
              {on && <motion.span aria-hidden layoutId={`${base}-tab`} transition={t(MOTION.indicator)} className="absolute inset-0 rounded-pill bg-ink" />}
              <span className="relative inline-flex items-center gap-2">
                {i.label}
                {i.badge}
              </span>
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
        className={`flex max-h-[92dvh] w-full flex-col rounded-t-panel bg-surface shadow-lift sm:rounded-panel ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
      >
        <div className="overflow-y-auto px-5 pt-3 pb-5 sm:px-6 sm:pt-6">
          <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" />
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id={titleId} className="display text-title text-ink text-balance">
                {title}
              </h2>
              {description && (
                <div id={descId} className="mt-1 text-body text-ink-2">
                  {description}
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} className="-m-1 grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-sunken hover:text-ink">
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

/** Mounted once by the shell. Inverse colours; bottom right on desktop, above the tab bar on phones; one polite live region. */
export function Toaster() {
  const items = useSyncExternalStore(
    subscribe,
    () => toasts,
    () => EMPTY,
  );
  const { reduce, t } = useMotion();
  return (
    <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--mobile-nav)+12px)] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:left-auto lg:right-6 lg:items-end">
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
      className="flex max-w-[min(92vw,520px)] items-center gap-2 rounded-panel bg-ink py-1.5 pr-1.5 pl-4 text-body text-bg shadow-lift"
    >
      <span className="min-w-0 flex-1 py-1.5">{item.message}</span>
      {action && (
        <button
          type="button"
          onClick={async () => {
            dismissToast(item.id);
            await action.run();
          }}
          className="h-9 shrink-0 rounded-pill px-3 font-semibold underline underline-offset-2 hover:bg-[color-mix(in_oklab,var(--bg)_14%,transparent)] focus-visible:outline-[var(--bg)] pointer-coarse:h-11"
        >
          {action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => dismissToast(item.id)}
        className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-[color-mix(in_oklab,var(--bg)_14%,transparent)] focus-visible:outline-[var(--bg)] pointer-coarse:size-11"
      >
        <X size={16} aria-hidden />
        <span className="sr-only">Dismiss</span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------- fly to a tab

/**
 * Shell targets that things can fly into: the Applications tab in the top bar and the phone
 * tab bar carry data-fly-target="applications". The deck flies a small copy of an applied
 * card there, then calls arrive("applications") so the tab pulses once.
 */
export type FlyTarget = "applications";

/** The visible element for a target (the top bar's on desktop, the tab bar's on phones), or null. */
export function flyTarget(name: FlyTarget): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-fly-target="${name}"]`);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

const ARRIVE = "deis:arrive";

/** Something just landed on a target: it pulses once. */
export function arrive(name: FlyTarget) {
  window.dispatchEvent(new CustomEvent(ARRIVE, { detail: name }));
}

/** For the shell: a ref for a target element that pulses (scale 1 → 1.12 → 1) when something arrives. Nothing under reduced motion. */
export function useArrivalPulse<T extends HTMLElement>(name: FlyTarget) {
  const [scope, animate] = useAnimate<T>();
  const reduce = useReducedMotion();
  useEffect(() => {
    const on = (e: Event) => {
      if (reduce || (e as CustomEvent).detail !== name || !scope.current) return;
      void animate(scope.current, { scale: [1, 1.12, 0.98, 1] }, { duration: 0.5, ease: [0.22, 1, 0.36, 1] });
    };
    window.addEventListener(ARRIVE, on);
    return () => window.removeEventListener(ARRIVE, on);
  }, [name, reduce, animate, scope]);
  return scope;
}

// ---------------------------------------------------------------------------- brand

/**
 * The wordmark: lowercase "deis" in Bricolage 800 and a small lime square, the brand's only
 * decorative lime. The square is drawn with a hairline so it reads on the light page.
 */
export function Wordmark({ large }: { large?: boolean }) {
  return (
    <span className={`inline-flex items-baseline leading-none text-ink ${large ? "gap-1.5" : "gap-1"}`}>
      <span lang="ga" className={`display tracking-[-0.045em] ${large ? "text-[56px]" : "text-[24px]"}`}>
        deis
      </span>
      <span aria-hidden className={`inline-block shrink-0 rounded-[2px] bg-pop shadow-[inset_0_0_0_1px_rgb(14_15_16/0.14)] ${large ? "size-3.5" : "size-[7px]"}`} />
    </span>
  );
}

// Words that say nothing about which company it is.
const MARK_SKIP = new Set(["the", "and", "of", "ltd", "limited", "inc", "plc", "llc", "gmbh", "dac", "uc", "group", "ireland", "irl", "co", "company", "holdings"]);

/** Up to two initials for a company name: "Bank of Ireland" -> "BI", "Tines" -> "T", "Stripe Ltd" -> "S". */
export function companyInitials(name: string): string {
  const words = name
    .split(/[\s\-_/&.,()]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  const kept = words.filter((w, i) => i === 0 || !MARK_SKIP.has(w.toLowerCase()));
  const picked = (kept.length ? kept : words).slice(0, 2);
  return picked.map((w) => w[0]!.toLocaleUpperCase("en-IE")).join("") || "?";
}

/** A stable hue (0 to 359) from a company name, so the same company always gets the same tile. */
export function companyHue(name: string): number {
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (Math.imul(h, 31) + ch.codePointAt(0)!) | 0;
  return Math.abs(h) % 360;
}

/**
 * A company's monogram tile: up to two initials on a muted hue hashed from the name
 * (hsl(h 35% 88%) light, hsl(h 25% 22%) dark, ink text). Radius 12, 40 px by default.
 * Decorative (aria-hidden): always show the company name as text beside it.
 */
export function CompanyMark({ name, size = 40, className = "" }: { name: string; size?: number; className?: string }) {
  const initials = companyInitials(name);
  return (
    <span
      aria-hidden
      className={`company-mark display inline-grid shrink-0 place-items-center rounded-mark font-bold tracking-[-0.02em] select-none ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * (initials.length > 1 ? 0.38 : 0.45)), ["--mark-h" as string]: companyHue(name) }}
    >
      {initials}
    </span>
  );
}
