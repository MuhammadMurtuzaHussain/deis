"use client";

import { Check, Plus } from "@phosphor-icons/react";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import type { Extracted } from "@/lib/ai/schema";
import { api, ApiError } from "@/lib/client/api";
import { db } from "@/lib/client/db";
import { useStore } from "@/lib/client/store";
import { dateRange } from "@/lib/cv/compose";
import { readProfileFile } from "@/lib/import/files";
import { newFactId, type Fact, type Header } from "@/lib/profile/types";
import { summary } from "./onboarding/steps";
import { AddFact, SlipGroup } from "./profile/FactSlips";
import { HeaderForm, NeverClaim } from "./profile/HeaderForm";
import { ImportPanel, type ImportState } from "./profile/ImportPanel";
import { factUsage } from "./profile/usage";
import { Button, EmptyState, Notice, PageHeader, PageSkeleton, RollingNumber, Section } from "./ui";

// The profile builder: a ledger of small true statements the user has confirmed.
// Imports (CV, LinkedIn PDF, LinkedIn data export) arrive unconfirmed; nothing is used
// on a CV until the user ticks it. Answers from the Careful lane arrive as proposals.

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

const PREF_ROWS: [string, string][] = [
  ["places", "Places"],
  ["stage", "Stage"],
  ["work", "Right to work"],
  ["roles", "Kinds of work"],
  ["languages", "Languages besides English"],
  ["stretch", "Stretch roles"],
];

export function ProfileScreen() {
  const { profile, putFacts, removeFact, setHeader, setNeverClaim, go, ai, status, effectiveModel } = useStore();
  const proposals = useLiveQuery(() => db.proposals.toArray(), [], []);
  const apps = useLiveQuery(() => db.applications.toArray(), [], []);
  const uses = useMemo(() => factUsage(apps), [apps]);
  const [importState, setImportState] = useState<ImportState>({ state: "idle" });
  const [addOpen, setAddOpen] = useState(false);

  if (!profile) return <PageSkeleton />;
  const { facts, header, neverClaim, preferences } = profile;
  const unconfirmed = facts.filter((f) => !f.confirmed);
  // The web demo shows its two fictional profiles and nothing else: your own CV and facts are for the app.
  const locked = Boolean(status?.hosted);
  const needsModel = !ai && !(status?.hosted && status.demoModel) && !effectiveModel.standIn;
  const local = effectiveModel.privacy.where === "this computer";

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

  // Group: each job with its own facts, each school with its own, then the rest.
  const roles = facts.filter((f) => f.kind === "role").sort((a, b) => (b.end ?? "9").localeCompare(a.end ?? "9"));
  const schools = facts.filter((f) => f.kind === "education");
  const homeOrgs = new Set([...roles, ...schools].map((f) => norm(f.org ?? "")).filter(Boolean));
  const loose = facts.filter((f) => f.kind !== "role" && f.kind !== "education" && !homeOrgs.has(norm(f.org ?? "")));
  const byOrg = (org: string | null | undefined, self: Fact) => facts.filter((f) => f !== self && f.kind !== "role" && f.kind !== "education" && org && norm(f.org ?? "") === norm(org));
  const said = summary(preferences);

  // Privacy copy from effectiveModel (PRD-4/SEC-3): no "never leaves your device" on the web demo.
  const privacyLine = `Files are read on this device. ${
    local ? "The text is split into facts by Gemma on this computer." : `The text is sent to ${effectiveModel.label} to be split into facts.`
  } A LinkedIn export ZIP is read without any AI.`;

  return (
    <div>
      <PageHeader
        title="Your profile"
        description={
          <>
            <p className="max-w-[64ch]">Small, true statements about you. Deis only writes what these say, and each line on a tailored CV points back to one of them.</p>
            <p className="mt-1 max-w-[64ch] text-caption text-ink-2">
              Saved only in {status?.desktop ? "this app" : "this browser"}. {effectiveModel.privacy.sentence}
            </p>
          </>
        }
      />

      <div className="grid gap-12">
        {locked && (
          <Notice tone="info" announce={false}>
            This is a demo profile, shown read-only. To add your own CV or LinkedIn, <a href="/download" className="underline underline-offset-2">get the Deis app</a>: it reads your files on your own computer.
          </Notice>
        )}

        {!locked && (
          <Section title="Add from a CV or LinkedIn">
            <ImportPanel state={importState} onFile={(f) => void onFile(f)} onText={(t) => void extract(t, /linkedin\.com\/in\//i.test(t) ? "linkedin" : "cv")} privacyLine={privacyLine} primary={facts.length === 0} />
          </Section>
        )}

        {proposals.length > 0 && (
          <Section title="New facts from your answers" description="You told Deis these while applying. Add the ones that are right.">
            <ul className="grid gap-2">
              {proposals.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface py-3 pr-3 pl-5">
                  <span className="min-w-0 text-body text-ink">
                    {p.text}
                    {p.org && <span className="text-ink-2">, at {p.org}</span>}
                  </span>
                  <span className="flex gap-2">
                    <Button size="sm" onClick={() => approve(p.id)}>
                      <Check size={16} aria-hidden />
                      Add<span className="sr-only">: {p.text}</span>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => db.proposals.delete(p.id)}>
                      Dismiss<span className="sr-only">: {p.text}</span>
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section
          title={
            <>
              What Deis knows about you <span className="ml-1 font-mono text-[14px] font-normal text-ink-3">
                <RollingNumber value={facts.length} />
              </span>
            </>
          }
          actions={
            <>
              {unconfirmed.length > 0 && (
                <Button variant="primary" size="sm" onClick={() => putFacts(unconfirmed.map((f) => ({ ...f, confirmed: true })))}>
                  Confirm all {unconfirmed.length}
                </Button>
              )}
              {!locked && (
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus size={16} aria-hidden />
                  Add a fact
                </Button>
              )}
            </>
          }
        >
          {unconfirmed.length > 0 && (
            <Notice tone="warn" announce={false}>
              {unconfirmed.length} {unconfirmed.length === 1 ? "fact needs" : "facts need"} a quick check. Deis won&apos;t use a fact until you confirm it, so fix anything an import got wrong first.
            </Notice>
          )}
          {facts.length === 0 ? (
            <EmptyState title="Nothing yet" action={locked ? undefined : <Button onClick={() => setAddOpen(true)}>Add a fact</Button>}>
              {locked ? "The demo profile has no facts yet." : "Drop a CV or LinkedIn file above, or add facts one at a time."}
            </EmptyState>
          ) : (
            <div className="gap-4 lg:columns-2">
              {roles.map((r, i) => (
                <SlipGroup key={r.id} order={i} head={r} items={byOrg(r.org, r)} subtitle={[r.org, r.where, dateRange(r.start, r.end)].filter(Boolean).join(", ")} uses={uses} onSave={putFacts} onRemove={removeFact} readOnly={locked} />
              ))}
              {schools.map((s, i) => (
                <SlipGroup key={s.id} order={roles.length + i} head={s} items={byOrg(s.org, s)} subtitle={dateRange(s.start, s.end)} uses={uses} onSave={putFacts} onRemove={removeFact} readOnly={locked} />
              ))}
              {loose.length > 0 && <SlipGroup order={roles.length + schools.length} title="Skills, projects and more" items={loose} uses={uses} onSave={putFacts} onRemove={removeFact} readOnly={locked} />}
            </div>
          )}
        </Section>

        {!locked && (
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-10">
            <HeaderForm header={header} onSave={setHeader} />
            <NeverClaim items={neverClaim} onSave={setNeverClaim} />
          </div>
        )}

        <Section
          title="What you're looking for"
          actions={
            locked ? undefined : (
              <Button size="sm" onClick={() => go({ name: "checkin" })}>
                Change<span className="sr-only"> what you&apos;re looking for</span>
              </Button>
            )
          }
        >
          <dl className="grid gap-x-8 gap-y-4 rounded-panel border border-line bg-surface p-5 sm:grid-cols-2 lg:grid-cols-3">
            {PREF_ROWS.map(([k, label]) => (
              <div key={k}>
                <dt className="text-caption text-ink-3">{label}</dt>
                <dd className="text-body text-ink">{said[k]}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>

      <AddFact open={addOpen} onClose={() => setAddOpen(false)} orgs={[...new Set(facts.map((f) => f.org).filter((o): o is string => Boolean(o)))]} onAdd={putFacts} />
    </div>
  );
}
