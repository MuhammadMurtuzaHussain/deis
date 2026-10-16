"use client";

import { X } from "@phosphor-icons/react";
import { useState } from "react";
import type { Header } from "@/lib/profile/types";
import { Button, Field, inputClass, Section } from "../ui";

// "Top of your CV" and "Never say this about me".
//
// The header form follows the saved header until you type (CH-8): an import that fills in
// your email shows up here, and Save only writes the fields you changed, so it never puts
// back an older value over an imported one. Links keep what you type as a raw string and
// are split only on save (CH-X3), so a space or comma doesn't vanish mid-word.

type Draft = { name: string; location: string; email: string; phone: string; links: string };
const toDraft = (h: Header): Draft => ({ name: h.name, location: h.location ?? "", email: h.email ?? "", phone: h.phone ?? "", links: (h.links ?? []).join(" ") });
export const splitLinks = (s: string) => s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean).slice(0, 5);

export function HeaderForm({ header, onSave }: { header: Header; onSave: (h: Header) => Promise<void> }) {
  const [touched, setTouched] = useState<Partial<Draft>>({});
  const [saved, setSaved] = useState(false);
  // Untouched fields show the saved header as it is now; touched ones show what you typed.
  const d: Draft = { ...toDraft(header), ...touched };
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => {
    setSaved(false);
    setTouched((t) => ({ ...t, [k]: e.target.value }));
  };
  const dirty = Object.keys(touched).length > 0;

  const save = async () => {
    const t = touched;
    await onSave({
      name: t.name !== undefined ? t.name.trim() : header.name,
      location: t.location !== undefined ? t.location.trim() || null : (header.location ?? null),
      email: t.email !== undefined ? t.email.trim() || null : (header.email ?? null),
      phone: t.phone !== undefined ? t.phone.trim() || null : (header.phone ?? null),
      links: t.links !== undefined ? splitLinks(t.links) : (header.links ?? []),
    });
    setTouched({});
    setSaved(true);
  };

  return (
    <Section title="Top of your CV" description="Copied onto every CV exactly as written here." className="content-start">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">{(id) => <input id={id} value={d.name} onChange={set("name")} className={inputClass} autoComplete="name" />}</Field>
        <Field label="Town or city">{(id) => <input id={id} value={d.location} onChange={set("location")} className={inputClass} placeholder="Galway, Ireland" />}</Field>
        <Field label="Email">{(id) => <input id={id} type="email" value={d.email} onChange={set("email")} className={inputClass} autoComplete="email" />}</Field>
        <Field label="Phone">{(id) => <input id={id} type="tel" value={d.phone} onChange={set("phone")} className={inputClass} autoComplete="tel" />}</Field>
      </div>
      <Field label="Links" help="LinkedIn, GitHub or portfolio, separated by spaces. Up to five.">
        {(id, desc) => <input id={id} aria-describedby={desc} value={d.links} onChange={set("links")} className={inputClass} spellCheck={false} />}
      </Field>
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={save} disabled={!dirty}>
          Save
        </Button>
        <span role="status" className="text-caption text-ink-2">
          {saved ? "Saved" : dirty ? "Not saved yet" : ""}
        </span>
      </div>
    </Section>
  );
}

export function NeverClaim({ items, onSave }: { items: string[]; onSave: (n: string[]) => Promise<void> }) {
  const [v, setV] = useState("");
  return (
    <Section title="Never say this about me" description="Anything here is removed from every CV, letter and answer, even if a model writes it. For example: fluent German, team lead, any certification." className="content-start">
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map((n) => (
            <li key={n} className="inline-flex items-center gap-1 rounded-pill border border-line bg-surface py-0.5 pr-0.5 pl-4 text-body text-ink">
              {n}
              <button type="button" onClick={() => onSave(items.filter((x) => x !== n))} className="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-sunken hover:text-danger pointer-coarse:size-11">
                <X size={16} aria-hidden />
                <span className="sr-only">Remove {n}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (v.trim()) await onSave([...new Set([...items, v.trim()])]);
          setV("");
        }}
      >
        <label htmlFor="never-input" className="sr-only">
          A phrase to block
        </label>
        <input id="never-input" value={v} onChange={(e) => setV(e.target.value)} className={inputClass} placeholder="A phrase to block" />
        <Button type="submit">Add</Button>
      </form>
    </Section>
  );
}
