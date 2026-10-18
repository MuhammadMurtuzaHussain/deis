"use client";

import { PencilSimple, Trash } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { FACT_KINDS, newFactId, type Fact, type FactKind } from "@/lib/profile/types";
import { Button, CompanyMark, Dialog, Field, inputClass, MOTION, selectClass, textareaClass, useMotion } from "../ui";

// Facts as slips, a group per employer or school with that company's mark, then the rest.
// Unconfirmed facts carry a warn left border and say "Not confirmed" in words; edit and
// delete are always visible; each slip says how many CV lines cite it across your kits,
// the count in a pop-soft pill (proven).

export const KIND_LABEL: Record<FactKind, string> = {
  role: "Job",
  achievement: "Achievement",
  skill: "Skills",
  education: "Education",
  project: "Project",
  certification: "Certificate",
  language: "Language",
  leadership: "Leadership",
  other: "Other",
};

type Save = (f: Fact[]) => Promise<void>;
type Remove = (id: string) => Promise<void>;

const ICON_BTN = "grid size-9 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-sunken hover:text-ink pointer-coarse:size-11";

function FactSlip({ fact, uses, onSave, onRemove, heading, subtitle, lead, showKind, readOnly }: { fact: Fact; uses: number; onSave: Save; onRemove: Remove; heading?: boolean; subtitle?: string; lead?: ReactNode; showKind?: boolean; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(fact.text);
  return (
    <li
      className={`relative flex items-start gap-3 py-2.5 pr-2 pl-4 before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full ${
        fact.confirmed ? "before:bg-transparent" : "before:bg-warn"
      }`}
    >
      <input
        type="checkbox"
        checked={fact.confirmed}
        disabled={readOnly}
        onChange={() => onSave([{ ...fact, confirmed: !fact.confirmed }])}
        aria-label={`${fact.confirmed ? "Confirmed" : "Confirm"}: ${fact.text}`}
        className={`size-5 shrink-0 cursor-pointer accent-[var(--ink)] disabled:cursor-default ${heading ? "mt-2.5" : "mt-0.5"}`}
      />
      {lead}
      {editing ? (
        <form
          className="flex flex-1 flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            await onSave([{ ...fact, text: text.trim(), confirmed: true }]);
            setEditing(false);
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Fact text" className={`${inputClass} min-w-[12rem] flex-1`} autoFocus />
          <Button size="sm" variant="primary" type="submit">
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="grid min-w-0 flex-1 gap-1">
          <p className={heading ? "text-[16px] leading-snug font-semibold text-ink" : "text-body leading-snug text-ink"}>
            {showKind && <span className="mr-2 text-caption font-medium text-ink-3">{KIND_LABEL[fact.kind]}</span>}
            {fact.text}
          </p>
          {subtitle && <p className="text-caption text-ink-2">{subtitle}</p>}
          {(!fact.confirmed || uses > 0) && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
              {!fact.confirmed && <span className="font-medium text-warn">Not confirmed</span>}
              {uses > 0 && (
                <span className="inline-flex items-center gap-1.5 text-ink-2">
                  <span className="num grid h-5 min-w-6 place-items-center rounded-full bg-pop-soft px-1 font-mono text-[11px] font-semibold text-ink">{uses}</span>
                  {uses === 1 ? "CV line uses this" : "CV lines use this"}
                </span>
              )}
            </p>
          )}
        </div>
      )}
      {!editing && !readOnly && (
        <span className={`flex shrink-0 ${heading ? "mt-1.5" : "-mt-1.5"}`}>
          <button
            type="button"
            onClick={() => {
              setText(fact.text);
              setEditing(true);
            }}
            className={ICON_BTN}
          >
            <PencilSimple size={18} aria-hidden />
            <span className="sr-only">Edit: {fact.text}</span>
          </button>
          <button type="button" onClick={() => onRemove(fact.id)} className={`${ICON_BTN} hover:text-danger`}>
            <Trash size={18} aria-hidden />
            <span className="sr-only">Delete: {fact.text}</span>
          </button>
        </span>
      )}
    </li>
  );
}

/** One employer, school or the loose facts: a panel of slips, headed by the company mark. */
export function SlipGroup({
  head,
  title,
  subtitle,
  items,
  uses,
  onSave,
  onRemove,
  order = 0,
  readOnly,
}: {
  /** Its place in the list, for the stagger as the groups arrive. */
  order?: number;
  head?: Fact;
  title?: string;
  subtitle?: string;
  items: Fact[];
  uses: Map<string, number>;
  onSave: Save;
  onRemove: Remove;
  /** The web demo's profiles: shown, not edited. */
  readOnly?: boolean;
}) {
  const org = head ? head.org || head.title || head.text : null;
  const { reduce, t } = useMotion();
  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={t({ ...MOTION.spring, delay: Math.min(order, 8) * 0.05 })}
      aria-label={head ? head.org || head.text : title}
      className="mb-4 break-inside-avoid rounded-panel border border-line bg-surface p-2"
    >
      {title && <h3 className="px-4 pt-3 pb-1 text-body font-semibold text-ink">{title}</h3>}
      {head && (
        <ul>
          <FactSlip fact={head} uses={uses.get(head.id) ?? 0} onSave={onSave} onRemove={onRemove} heading subtitle={subtitle} readOnly={readOnly} lead={org ? <CompanyMark name={org} size={40} className="shrink-0" /> : null} />
        </ul>
      )}
      {items.length > 0 && (
        <ul className={`grid ${head ? "mt-1 border-t border-line pt-1" : ""}`}>
          {items.map((f) => (
            <FactSlip key={f.id} fact={f} uses={uses.get(f.id) ?? 0} onSave={onSave} onRemove={onRemove} readOnly={readOnly} showKind={!head || f.kind !== "achievement"} />
          ))}
        </ul>
      )}
    </motion.section>
  );
}

export function AddFact({ open, onClose, orgs, onAdd }: { open: boolean; onClose: () => void; orgs: string[]; onAdd: Save }) {
  const [kind, setKind] = useState<FactKind>("achievement");
  const [text, setText] = useState("");
  const [org, setOrg] = useState("");
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const isRole = kind === "role" || kind === "education";
  const formId = "add-fact";
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a fact"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId}>
            Add
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const t = kind === "role" ? title || text : text;
          if (!t.trim()) return;
          await onAdd([{ id: newFactId(), kind, text: t.trim(), org: org.trim() || null, title: kind === "role" ? title.trim() || t.trim() : null, start: start || null, end: end || null, source: "manual", confirmed: true, createdAt: new Date().toISOString() }]);
          setText("");
          setTitle("");
          onClose();
        }}
      >
        <Field label="What kind">
          {(id) => (
            <select id={id} value={kind} onChange={(e) => setKind(e.target.value as FactKind)} className={selectClass}>
              {FACT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          )}
        </Field>
        {kind === "role" ? (
          <Field label="Job title">{(id) => <input id={id} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required />}</Field>
        ) : (
          <Field label="The fact" help="One thing, as you'd say it in an interview: what you did and, if you know it, the result.">
            {(id, d) => <textarea id={id} aria-describedby={d} rows={3} value={text} onChange={(e) => setText(e.target.value)} className={textareaClass} required />}
          </Field>
        )}
        <Field label={kind === "education" ? "University or college" : "Where (employer, university, society)"}>
          {(id) => (
            <>
              <input id={id} list="orgs" value={org} onChange={(e) => setOrg(e.target.value)} className={inputClass} />
              <datalist id="orgs">
                {orgs.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        {isRole && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="From" help="Like 2025-04">
              {(id, d) => <input id={id} aria-describedby={d} value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />}
            </Field>
            <Field label="To" help="Or present">
              {(id, d) => <input id={id} aria-describedby={d} value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />}
            </Field>
          </div>
        )}
      </form>
    </Dialog>
  );
}
