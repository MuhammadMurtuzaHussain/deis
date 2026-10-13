"use client";

import { Check, FileArrowUp, LinkedinLogo, PencilSimple, Plus, Trash, X } from "@phosphor-icons/react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import type { Extracted } from "@/lib/ai/schema";
import { api, ApiError } from "@/lib/client/api";
import { db } from "@/lib/client/db";
import { useStore } from "@/lib/client/store";
import { dateRange } from "@/lib/cv/compose";
import { readProfileFile } from "@/lib/import/files";
import { categoryById } from "@/lib/jobs/categories";
import { WORK_STATUS_LABEL } from "@/lib/jobs/rightToWork";
import { FACT_KINDS, newFactId, STAGE_LABEL, type Fact, type FactKind, type Header } from "@/lib/profile/types";
import { Button, Dialog, Elapsed, Field, inputClass, Notice, textareaClass } from "./ui";

// The profile builder: a ledger of small true statements the user has confirmed.
// Imports (CV, LinkedIn PDF, LinkedIn data export) arrive unconfirmed; nothing is used
// on a CV until the user ticks it. Answers from the Careful lane arrive as proposals.

const KIND_LABEL: Record<FactKind, string> = {
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

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function mergeHeader(current: Header, incoming: Partial<Header> | Extracted["header"]): Header {
  return {
    name: current.name || incoming.name || "",
    email: current.email || incoming.email || null,
    phone: current.phone || incoming.phone || null,
    location: current.location || incoming.location || null,
    links: [...new Set([...(current.links ?? []), ...((incoming.links ?? []) as string[])])].slice(0, 5),
  };
}

export function ProfileScreen() {
  const { profile, putFacts, removeFact, setHeader, setNeverClaim, go, ai, status } = useStore();
  const proposals = useLiveQuery(() => db.proposals.toArray(), [], []);
  const [importState, setImportState] = useState<{ state: "idle" | "reading" | "ai" | "done" | "error"; message?: string; since?: number }>({ state: "idle" });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!profile) return null;
  const { facts, header, neverClaim, preferences } = profile;
  const unconfirmed = facts.filter((f) => !f.confirmed);
  const needsModel = !ai && !(status?.hosted && status.demoModel);

  const addFacts = async (incoming: Fact[]) => {
    const seen = new Set(facts.map((f) => norm(f.text) + "|" + norm(f.org ?? "")));
    const fresh = incoming.filter((f) => !seen.has(norm(f.text) + "|" + norm(f.org ?? "")));
    await putFacts(fresh);
    return fresh.length;
  };

  const extract = async (text: string, source: "cv" | "linkedin") => {
    if (needsModel) return go({ name: "model" });
    setImportState({ state: "ai", since: Date.now() });
    try {
      const out = await api<Extracted>("/api/import", { source, text });
      await setHeader(mergeHeader(header, out.header));
      const now = new Date().toISOString();
      const n = await addFacts(out.facts.map((f) => ({ ...f, id: newFactId(), source, confirmed: false, createdAt: now })));
      setImportState({ state: "done", message: `Gemma found ${n} new facts. Check each one below, then confirm.` });
    } catch (e) {
      setImportState({ state: "error", message: e instanceof ApiError ? e.message : "Couldn't read that. Try pasting the text instead." });
    }
  };

  const onFile = async (file: File) => {
    setImportState({ state: "reading" });
    try {
      const read = await readProfileFile(file);
      if (read.kind === "linkedin_export") {
        await setHeader(mergeHeader(header, read.result.header));
        const n = await addFacts(read.result.facts);
        setImportState({ state: "done", message: `Read ${n} facts from your LinkedIn export, without any AI. Check them below.` });
      } else await extract(read.text, read.source);
    } catch (e) {
      setImportState({ state: "error", message: e instanceof Error ? e.message : "Couldn't read that file." });
    }
  };

  const approve = async (id: string) => {
    const p = proposals.find((x) => x.id === id);
    if (!p) return;
    await putFacts([{ id: newFactId(), kind: p.kind, text: p.text, org: p.org, source: "answer", confirmed: true, createdAt: new Date().toISOString() }]);
    await db.proposals.delete(id);
  };

  // Group: each job with its own facts, each school with its own, then the rest by kind.
  const roles = facts.filter((f) => f.kind === "role").sort((a, b) => (b.end ?? "9").localeCompare(a.end ?? "9"));
  const schools = facts.filter((f) => f.kind === "education");
  const homeOrgs = new Set([...roles, ...schools].map((f) => norm(f.org ?? "")).filter(Boolean));
  const loose = facts.filter((f) => f.kind !== "role" && f.kind !== "education" && !homeOrgs.has(norm(f.org ?? "")));
  const byOrg = (org: string | null | undefined, self: Fact) => facts.filter((f) => f !== self && f.kind !== "role" && f.kind !== "education" && org && norm(f.org ?? "") === norm(org));

  return (
    <div className="grid gap-10">
      <div>
        <h1 className="text-3xl font-bold">Your profile</h1>
        <p className="mt-2 max-w-[64ch] text-ink-2">
          Small, true statements about you. Deis only writes what these say, and each line on a tailored CV points back to one of them. It all stays on this device.
        </p>
      </div>

      <section aria-labelledby="import" className="grid gap-4">
        <h2 id="import" className="text-xl font-bold">
          Add from a CV or LinkedIn
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={importState.state === "reading" || importState.state === "ai"}>
            <FileArrowUp size={18} aria-hidden />
            Upload a CV or LinkedIn file
          </Button>
          <Button onClick={() => setPasteOpen(true)}>Paste text</Button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.zip"
            className="sr-only"
            aria-label="Upload a CV, LinkedIn PDF or LinkedIn data export"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
        </div>
        <details className="max-w-[70ch] text-[15px] text-ink-2">
          <summary className="cursor-pointer text-ink">
            <LinkedinLogo size={18} className="mr-1 inline align-[-3px]" aria-hidden />
            Getting your LinkedIn into Deis
          </summary>
          <div className="mt-3 grid gap-2 pl-1">
            <p>LinkedIn doesn&apos;t let apps read profiles, so there are two ways in, both from your own account:</p>
            <p>
              <strong>Quickest:</strong> open your profile, choose <em>More</em>, then <em>Save to PDF</em>, and upload that PDF here.
            </p>
            <p>
              <strong>Most complete:</strong> Settings, <em>Data privacy</em>, <em>Get a copy of your data</em>. Pick Positions, Education, Skills and Profile. LinkedIn emails a ZIP in about ten minutes; upload it here as it is. Deis reads it without any AI.
            </p>
            <p>Word or PDF CVs are read on this device. Only the text goes to your chosen model to be split into facts.</p>
          </div>
        </details>
        {importState.state === "reading" && <Notice>Reading the file on this device…</Notice>}
        {importState.state === "ai" && (
          <Notice>
            Gemma is splitting your CV into facts… <Elapsed since={importState.since!} />
          </Notice>
        )}
        {importState.state === "done" && <Notice tone="ok">{importState.message}</Notice>}
        {importState.state === "error" && <Notice tone="error">{importState.message}</Notice>}
      </section>

      {proposals.length > 0 && (
        <section aria-labelledby="proposals" className="grid gap-3">
          <h2 id="proposals" className="text-xl font-bold">
            New facts from your answers
          </h2>
          <p className="text-ink-2">You told Deis these while applying. Add the ones that are right.</p>
          <ul className="grid gap-2">
            {proposals.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-line bg-surface p-4">
                <span>
                  {p.text}
                  {p.org && <span className="text-ink-3">, at {p.org}</span>}
                </span>
                <span className="flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => approve(p.id)}>
                    <Check size={16} aria-hidden />
                    Add
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => db.proposals.delete(p.id)}>
                    Dismiss
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="facts" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="facts" className="text-xl font-bold">
            What Deis knows about you <span className="num text-base font-normal text-ink-3">({facts.length})</span>
          </h2>
          <div className="flex gap-2">
            {unconfirmed.length > 0 && (
              <Button variant="primary" size="sm" onClick={() => putFacts(unconfirmed.map((f) => ({ ...f, confirmed: true })))}>
                Confirm all {unconfirmed.length}
              </Button>
            )}
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus size={16} aria-hidden />
              Add a fact
            </Button>
          </div>
        </div>
        {unconfirmed.length > 0 && (
          <Notice tone="warn">
            {unconfirmed.length} {unconfirmed.length === 1 ? "fact needs" : "facts need"} a quick check. Deis won&apos;t use a fact until you confirm it, so fix anything an import got wrong first.
          </Notice>
        )}
        {facts.length === 0 && <p className="rounded-surface border border-dashed border-line p-6 text-ink-2">Nothing yet. Upload a CV or LinkedIn file above, or add facts one at a time.</p>}

        {roles.map((r) => (
          <OrgGroup key={r.id} head={r} items={byOrg(r.org, r)} subtitle={[r.org, r.where, dateRange(r.start, r.end)].filter(Boolean).join(", ")} onSave={putFacts} onRemove={removeFact} />
        ))}
        {schools.map((s) => (
          <OrgGroup key={s.id} head={s} items={byOrg(s.org, s)} subtitle={dateRange(s.start, s.end)} onSave={putFacts} onRemove={removeFact} />
        ))}
        {loose.length > 0 && (
          <div className="rounded-surface border border-line bg-surface p-5">
            <h3 className="font-bold">Skills, projects and more</h3>
            <ul className="mt-3 grid gap-1">
              {loose.map((f) => (
                <FactRow key={f.id} fact={f} onSave={putFacts} onRemove={removeFact} showKind />
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <HeaderForm header={header} onSave={setHeader} />
        <NeverClaim items={neverClaim} onSave={setNeverClaim} />
      </div>

      <section aria-labelledby="prefs" className="grid gap-3">
        <div className="flex items-end justify-between gap-3">
          <h2 id="prefs" className="text-xl font-bold">
            What you&apos;re looking for
          </h2>
          <Button size="sm" onClick={() => go({ name: "checkin" })}>
            Change
          </Button>
        </div>
        <dl className="grid gap-x-8 gap-y-3 rounded-surface border border-line bg-surface p-5 sm:grid-cols-2">
          {[
            ["Places", [...preferences.cities, preferences.remoteOk ? "remote in Ireland" : null].filter(Boolean).join(", ") || "Anywhere in Ireland"],
            ["Stage", preferences.stage ? STAGE_LABEL[preferences.stage] : "Not set"],
            ["Right to work", preferences.workStatus ? WORK_STATUS_LABEL[preferences.workStatus] : "Not set"],
            ["Kinds of work", preferences.roles.map((r) => categoryById(r)?.label ?? r).join(", ") || "Not set"],
            ["Languages besides English", preferences.languages.join(", ") || "None"],
            ["Stretch roles", preferences.showStretch ? "Shown, labelled" : "Hidden"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm text-ink-3">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Dialog open={pasteOpen} onClose={() => setPasteOpen(false)} title="Paste your CV or LinkedIn text">
        <Field label="Text" help="Copy everything from your CV, or your LinkedIn About and Experience sections.">
          {(id, d) => <textarea id={id} aria-describedby={d} rows={12} value={paste} onChange={(e) => setPaste(e.target.value)} className={textareaClass} />}
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setPasteOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={paste.trim().length < 80}
            onClick={() => {
              setPasteOpen(false);
              void extract(paste, /linkedin\.com\/in\//i.test(paste) ? "linkedin" : "cv");
            }}
          >
            Read it
          </Button>
        </div>
      </Dialog>

      <AddFact open={addOpen} onClose={() => setAddOpen(false)} orgs={[...new Set(facts.map((f) => f.org).filter((o): o is string => Boolean(o)))]} onAdd={putFacts} />
    </div>
  );
}

function OrgGroup({ head, items, subtitle, onSave, onRemove }: { head: Fact; items: Fact[]; subtitle: string; onSave: (f: Fact[]) => Promise<void>; onRemove: (id: string) => Promise<void> }) {
  return (
    <div className="rounded-surface border border-line bg-surface p-5">
      <ul className="grid gap-1">
        <FactRow fact={head} onSave={onSave} onRemove={onRemove} heading />
      </ul>
      {subtitle && <p className="ml-9 text-sm text-ink-3">{subtitle}</p>}
      {items.length > 0 && (
        <ul className="mt-2 grid gap-1 pl-4">
          {items.map((f) => (
            <FactRow key={f.id} fact={f} onSave={onSave} onRemove={onRemove} showKind={f.kind !== "achievement"} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FactRow({ fact, onSave, onRemove, heading, showKind }: { fact: Fact; onSave: (f: Fact[]) => Promise<void>; onRemove: (id: string) => Promise<void>; heading?: boolean; showKind?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(fact.text);
  return (
    <li className="group flex items-start gap-3 rounded-control px-1 py-1.5 hover:bg-surface-2">
      <input
        type="checkbox"
        checked={fact.confirmed}
        onChange={() => onSave([{ ...fact, confirmed: !fact.confirmed }])}
        aria-label={`${fact.confirmed ? "Confirmed" : "Confirm"}: ${fact.text}`}
        className="mt-1 size-5 shrink-0 accent-[var(--accent)]"
      />
      {editing ? (
        <form
          className="flex flex-1 flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await onSave([{ ...fact, text: text.trim(), confirmed: true, source: fact.source }]);
            setEditing(false);
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Fact text" className={`${inputClass} flex-1`} autoFocus />
          <Button size="sm" variant="primary" type="submit">
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => (setText(fact.text), setEditing(false))}>
            Cancel
          </Button>
        </form>
      ) : (
        <span className={`flex-1 ${heading ? "font-bold" : ""} ${fact.confirmed ? "" : "text-ink-2"}`}>
          {showKind && <span className="mr-2 text-sm text-ink-3">{KIND_LABEL[fact.kind]}</span>}
          {fact.text}
          {!fact.confirmed && <span className="ml-2 text-sm text-amber">Not confirmed</span>}
        </span>
      )}
      {!editing && (
        <span className="flex shrink-0 gap-1 opacity-60 group-hover:opacity-100 group-focus-within:opacity-100">
          <button type="button" onClick={() => setEditing(true)} aria-label={`Edit: ${fact.text}`} className="rounded-control p-1.5 text-ink-2 hover:bg-surface hover:text-ink">
            <PencilSimple size={18} />
          </button>
          <button type="button" onClick={() => onRemove(fact.id)} aria-label={`Delete: ${fact.text}`} className="rounded-control p-1.5 text-ink-2 hover:bg-surface hover:text-brick">
            <Trash size={18} />
          </button>
        </span>
      )}
    </li>
  );
}

function AddFact({ open, onClose, orgs, onAdd }: { open: boolean; onClose: () => void; orgs: string[]; onAdd: (f: Fact[]) => Promise<void> }) {
  const [kind, setKind] = useState<FactKind>("achievement");
  const [text, setText] = useState("");
  const [org, setOrg] = useState("");
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const isRole = kind === "role" || kind === "education";
  return (
    <Dialog open={open} onClose={onClose} title="Add a fact">
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const t = isRole && kind === "role" ? title || text : text;
          await onAdd([{ id: newFactId(), kind, text: t.trim(), org: org.trim() || null, title: kind === "role" ? title.trim() || t.trim() : null, start: start || null, end: end || null, source: "manual", confirmed: true, createdAt: new Date().toISOString() }]);
          setText("");
          setTitle("");
          onClose();
        }}
      >
        <Field label="What kind">
          {(id) => (
            <select id={id} value={kind} onChange={(e) => setKind(e.target.value as FactKind)} className={inputClass}>
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
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            Add
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function HeaderForm({ header, onSave }: { header: Header; onSave: (h: Header) => Promise<void> }) {
  const [h, setH] = useState(header);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof Header, v: string) => {
    setSaved(false);
    setH({ ...h, [k]: k === "links" ? v.split(/[\s,]+/).filter(Boolean) : v });
  };
  return (
    <section aria-labelledby="header" className="grid content-start gap-4">
      <h2 id="header" className="text-xl font-bold">
        Top of your CV
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">{(id) => <input id={id} value={h.name} onChange={(e) => set("name", e.target.value)} className={inputClass} autoComplete="name" />}</Field>
        <Field label="Town or city">{(id) => <input id={id} value={h.location ?? ""} onChange={(e) => set("location", e.target.value)} className={inputClass} placeholder="Galway, Ireland" />}</Field>
        <Field label="Email">{(id) => <input id={id} type="email" value={h.email ?? ""} onChange={(e) => set("email", e.target.value)} className={inputClass} autoComplete="email" />}</Field>
        <Field label="Phone">{(id) => <input id={id} type="tel" value={h.phone ?? ""} onChange={(e) => set("phone", e.target.value)} className={inputClass} autoComplete="tel" />}</Field>
      </div>
      <Field label="Links" help="LinkedIn, GitHub or portfolio, separated by spaces.">
        {(id, d) => <input id={id} aria-describedby={d} value={(h.links ?? []).join(" ")} onChange={(e) => set("links", e.target.value)} className={inputClass} />}
      </Field>
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          onClick={async () => {
            await onSave(h);
            setSaved(true);
          }}
        >
          Save
        </Button>
        {saved && <span className="text-sm text-accent-text">Saved</span>}
      </div>
    </section>
  );
}

function NeverClaim({ items, onSave }: { items: string[]; onSave: (n: string[]) => Promise<void> }) {
  const [v, setV] = useState("");
  return (
    <section aria-labelledby="never" className="grid content-start gap-4">
      <h2 id="never" className="text-xl font-bold">
        Never say this about me
      </h2>
      <p className="text-ink-2">Anything here is removed from every CV, letter and answer, even if a model writes it. For example: fluent German, team lead, any certification.</p>
      <ul className="flex flex-wrap gap-2">
        {items.map((n) => (
          <li key={n} className="inline-flex items-center gap-1 rounded-control border border-line bg-surface py-1 pl-3 pr-1">
            {n}
            <button type="button" aria-label={`Remove ${n}`} onClick={() => onSave(items.filter((x) => x !== n))} className="rounded-control p-1 text-ink-2 hover:text-brick">
              <X size={16} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (v.trim()) await onSave([...new Set([...items, v.trim()])]);
          setV("");
        }}
      >
        <label htmlFor="never-input" className="sr-only">
          Add a phrase
        </label>
        <input id="never-input" value={v} onChange={(e) => setV(e.target.value)} className={inputClass} placeholder="A phrase to block" />
        <Button type="submit">Add</Button>
      </form>
    </section>
  );
}
