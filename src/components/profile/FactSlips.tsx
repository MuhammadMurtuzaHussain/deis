"use client";

import { Path, PencilSimple, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { FACT_KINDS, newFactId, type Fact, type FactKind } from "@/lib/profile/types";
import { Button, Dialog, Field, inputClass, selectClass, textareaClass } from "../ui";

// Facts as paper slips. A group per employer or school, then the rest. Unconfirmed facts
// carry an ochre left border and say so in words; edit and delete are always visible; each
// slip says how many CV lines cite it across your kits.

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

const ICON_BTN = "grid size-9 shrink-0 place-items-center rounded-control text-ink-2 hover:bg-wash hover:text-ink pointer-coarse:size-11";

function FactSlip({ fact, uses, onSave, onRemove, heading, showKind }: { fact: Fact; uses: number; onSave: Save; onRemove: Remove; heading?: boolean; showKind?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(fact.text);
  return (
    <li className={`flex items-start gap-3 rounded-control border-l-[3px] py-2 pr-1 pl-3 ${fact.confirmed ? "border-transparent" : "border-ochre bg-ochre-soft/60"}`}>
      <input
        type="checkbox"
        checked={fact.confirmed}
        onChange={() => onSave([{ ...fact, confirmed: !fact.confirmed }])}
        aria-label={`${fact.confirmed ? "Confirmed" : "Confirm"}: ${fact.text}`}
        className="mt-1 size-5 shrink-0 accent-[var(--ink)]"
      />
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
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className={`text-body ${heading ? "font-bold text-ink" : "text-ink"}`}>
            {showKind && <span className="mr-2 text-caption text-ink-3">{KIND_LABEL[fact.kind]}</span>}
            {fact.text}
          </p>
          <p className="flex flex-wrap gap-x-3 text-caption">
            {!fact.confirmed && <span className="font-medium text-ochre">Not confirmed yet</span>}
            {uses > 0 && (
              <span className="inline-flex items-center gap-1 text-trace">
                <Path size={14} aria-hidden />
                Used in {uses} CV {uses === 1 ? "line" : "lines"}
              </span>
            )}
          </p>
        </div>
      )}
      {!editing && (
        <span className="flex shrink-0">
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
          <button type="button" onClick={() => onRemove(fact.id)} className={`${ICON_BTN} hover:text-brick`}>
            <Trash size={18} aria-hidden />
            <span className="sr-only">Delete: {fact.text}</span>
          </button>
        </span>
      )}
    </li>
  );
}

/** One employer, school or the loose facts: a sheet of slips. */
export function SlipGroup({
  head,
  title,
  subtitle,
  items,
  uses,
  onSave,
  onRemove,
}: {
  head?: Fact;
  title?: string;
  subtitle?: string;
  items: Fact[];
  uses: Map<string, number>;
  onSave: Save;
  onRemove: Remove;
}) {
  return (
    <div className="rounded-surface bg-raised p-3 shadow-card sm:p-4">
      {title && <h3 className="px-3 pt-1 pb-2 text-body font-bold text-ink">{title}</h3>}
      {head && (
        <ul>
          <FactSlip fact={head} uses={uses.get(head.id) ?? 0} onSave={onSave} onRemove={onRemove} heading />
        </ul>
      )}
      {subtitle && <p className="pb-1 pl-11 text-caption text-ink-2">{subtitle}</p>}
      {items.length > 0 && (
        <ul className={`grid gap-1 ${head ? "mt-1 border-t border-line pt-2 sm:pl-4" : ""}`}>
          {items.map((f) => (
            <FactSlip key={f.id} fact={f} uses={uses.get(f.id) ?? 0} onSave={onSave} onRemove={onRemove} showKind={!head || f.kind !== "achievement"} />
          ))}
        </ul>
      )}
    </div>
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
