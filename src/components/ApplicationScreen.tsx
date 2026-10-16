"use client";

import { ArrowLeft, ArrowsLeftRight, CheckCircle, CircleDashed, Copy, DownloadSimple, Printer, ShieldCheck } from "@phosphor-icons/react";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GUARD_VERSION, type GapQuestions, type Proposals } from "@/lib/cv/schema";
import { api, ApiError } from "@/lib/client/api";
import { db, loadProfile, STATUS_LABEL, STATUSES, type Application, type Kit, type Status } from "@/lib/client/db";
import { runFit, runKit, updateApplication } from "@/lib/client/kit";
import { routeHref, useStore } from "@/lib/client/store";
import { cvSections, cvText, REFERENCES, type CvDocument } from "@/lib/cv/compose";
import { cvDocx, cvFileName, letterDocx, letterFileName, toBlob } from "@/lib/cv/docx";
import type { GuardRule } from "@/lib/cv/guard";
import { readRightToWork, workFit, WORK_FIT_COPY, WORK_STATUS_LABEL } from "@/lib/jobs/rightToWork";
import { newFactId, type Fact } from "@/lib/profile/types";
import { LevelBadge } from "./JobCard";
import { useKitQueue } from "./KitQueue";
import { Button, Elapsed, Field, LinkButton, Notice, textareaClass } from "./ui";

// One application: the honest fit check, then the kit. In the Careful lane Deis asks
// about the gaps first and turns the answers into proposed facts. Every CV line can
// show the facts it came from, and everything the guard removed is listed.

export const RULE_COPY: Record<GuardRule, string> = {
  uncited: "No fact behind it",
  unknown_fact: "Pointed at a fact that doesn't exist",
  unsupported_number: "A number that isn't in your facts",
  unsupported_tool: "A tool that isn't in your facts",
  unsupported_cert: "A certificate you don't list",
  years_claim: "A total years of experience",
  never_claim: "On your never-say list",
  wrong_employer: "Put under the wrong job",
  first_person: "Written as “I” on a CV",
  unsupported_skill: "A skill you don't list",
  fit_demoted: "A claimed match with nothing behind it",
  past_as_present: "Said you're still studying a finished degree",
  work_status: "A claim about your visa or right to work",
  added_claim: "Claimed more than your facts say",
  posting_copy: "Copied from the job posting",
};

/** Kit part names in the server's `errors` lines. */
const PART_COPY: Record<string, string> = { cv: "CV", letter: "cover letter", answers: "form answers" };

const VERDICT: Record<string, string> = { close: "Close fit", good: "Good fit", stretch: "A stretch, worth a go", major_stretch: "A big stretch" };

async function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => undefined);
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
    >
      <Copy size={16} aria-hidden />
      {done ? "Copied" : label}
    </Button>
  );
}

function Sources({ ids, facts }: { ids: string[]; facts: Map<string, Fact> }) {
  const found = ids.map((id) => facts.get(id)).filter((f): f is Fact => Boolean(f));
  if (!found.length) return null;
  return (
    <span className="mt-1 block font-sans text-[11px] leading-snug text-[#11553f] print:hidden">
      From: {found.map((f) => f.text).join(" | ")}
    </span>
  );
}

function H({ children }: { children: string }) {
  return <h3 className="mt-4 border-b border-[#1F2A2E] pb-0.5 text-[13px] font-bold uppercase tracking-wide text-[#1F2A2E]">{children}</h3>;
}

function CvPaper({ cv, facts, showSources, id, className = "" }: { cv: CvDocument; facts: Map<string, Fact>; showSources: boolean; id?: string; className?: string }) {
  const S = (ids: string[]) => (showSources ? <Sources ids={ids} facts={facts} /> : null);
  return (
    <div id={id} className={`rounded-surface border border-line bg-white p-8 font-[Arial,Helvetica,sans-serif] text-[13px] leading-relaxed text-[#1a1a1a] shadow-lift sm:p-10 ${className}`}>
      {cvSections(cv).map((s) =>
        s.id === "header" ? (
          <div key="header">
            <p className="text-center text-2xl font-bold text-[#1F2A2E]">{s.name}</p>
            <p className="mt-1 text-center text-[12px] text-[#333]">{s.contact}</p>
          </div>
        ) : (
          <div key={s.id}>
            <H>{s.title}</H>
            {s.paragraph && s.paragraph.length > 0 && (
              <>
                <p className="mt-1.5">{s.paragraph.map((l) => l.text).join(" ")}</p>
                {S([...new Set(s.paragraph.flatMap((l) => l.facts))])}
              </>
            )}
            {s.entries?.map((e, i) => (
              <div key={i} className="mt-2">
                <p className="flex justify-between gap-4 font-bold">
                  <span>{e.heading}</span>
                  <span className="shrink-0">{e.dates}</span>
                </p>
                {e.lines.length > 0 && (
                  <ul className="list-disc pl-5">
                    {e.lines.map((l, j) => (
                      <li key={j}>
                        {l.text}
                        {S(l.facts)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {s.bullets && s.bullets.length > 0 && (
              <ul className="mt-1.5 list-disc pl-5">
                {s.bullets.map((b, i) => (
                  <li key={i}>
                    {b.label && <strong>{b.label}: </strong>}
                    {b.text}
                    {S(b.facts)}
                  </li>
                ))}
              </ul>
            )}
            {s.lists?.map((l, i) => (
              <p key={i} className="mt-1.5">
                {l.label && <strong>{l.label}: </strong>}
                {l.items.join(", ")}
              </p>
            ))}
          </div>
        ),
      )}
      <p className="mt-5 italic">{REFERENCES}</p>
    </div>
  );
}

/**
 * "Save as PDF" prints this copy alone: the CV sheet with no source notes, and nothing
 * else on the page in the layout, so no blank pages follow it.
 */
function PrintSheet({ cv }: { cv: CvDocument }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <style>{"@media print { body > :not(#cv-print) { display: none !important; } }"}</style>
      <CvPaper cv={cv} facts={new Map()} showSources={false} id="cv-print" className="hidden print:block" />
    </>,
    document.body,
  );
}

function KitView({ app, kit, facts }: { app: Application; kit: Kit; facts: Map<string, Fact> }) {
  const { profile, licence } = useStore();
  const [tab, setTab] = useState<"cv" | "letter" | "answers" | "checks">("cv");
  const [again, setAgain] = useState<{ since: number } | null>(null);
  const [againError, setAgainError] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);
  const name = profile?.header.name ?? kit.cv.header.name;
  const tabs = [
    ["cv", "CV"],
    ...(kit.letter ? [["letter", "Cover letter"]] : []),
    ...(kit.answers ? [["answers", "Form answers"]] : []),
    ["checks", `Checks${kit.events.length ? ` (${kit.events.length})` : ""}`],
  ] as [typeof tab, string][];
  // Parts the server couldn't write ("letter: ..."), and kits checked by older guard rules.
  const missing = [...new Set((kit.errors ?? []).map((e) => PART_COPY[e.split(":")[0]] ?? "part of the kit"))];
  // Rewriting needs a fit and a licence that isn't locked. The older-rules note is only for a kit not yet sent.
  const canRewrite = licence?.state !== "locked" && Boolean(app.fit);
  const older = (kit.guardVersion ?? 1) < GUARD_VERSION && app.status === "ready";
  const repairs = kit.repairs ?? [];
  // The kit on screen stays until the new one is saved, so a failed rewrite loses nothing.
  const writeAgain = async () => {
    if (!app.fit || again) return;
    setAgain({ since: Date.now() });
    setAgainError(null);
    try {
      const next = await runKit(app.job, await loadProfile(), app.fit);
      await updateApplication(app.id, { kit: next, kitError: null });
    } catch (e) {
      setAgainError(e instanceof ApiError ? e.message : "The kit couldn't be written again. This one is unchanged.");
    } finally {
      setAgain(null);
    }
  };
  const againButton = canRewrite && !again && (
    <button className="font-medium underline" onClick={writeAgain}>
      Write it again
    </button>
  );

  return (
    <section aria-labelledby="kit" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="kit" className="text-xl font-bold">
          Your application kit
        </h2>
        <p className="text-sm text-ink-3">
          {kit.model}, <span className="num">{(kit.usage.ms / 1000).toFixed(0)} s</span>, <span className="num">{(kit.usage.inputTokens + kit.usage.outputTokens).toLocaleString("en-IE")}</span> tokens
        </p>
      </div>
      {missing.length > 0 && (
        <Notice tone="warn">
          Gemma couldn&apos;t write the {missing.join(" or the ")} this time. {againButton}
        </Notice>
      )}
      {older && !missing.length && (
        <Notice>
          This kit was checked by an older version of Deis&apos;s rules.{againButton && <> {againButton} to check it with the current ones.</>}
        </Notice>
      )}
      {again && (
        <Notice>
          Writing it again. This kit stays until the new one is ready. <Elapsed since={again.since} />
        </Notice>
      )}
      {againError && <Notice tone="error">{againError}</Notice>}
      <div role="tablist" aria-label="Kit" className="flex flex-wrap gap-1 border-b border-line">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)} className={`-mb-px h-11 border-b-2 px-4 text-[15px] ${tab === id ? "border-accent font-bold text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "cv" && (
        <div role="tabpanel" className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={async () => download(await toBlob(cvDocx(kit.cv)), cvFileName(app.job.company, app.job.title, name))}>
              <DownloadSimple size={18} aria-hidden />
              Download Word
            </Button>
            <Button onClick={() => window.print()}>
              <Printer size={18} aria-hidden />
              Save as PDF
            </Button>
            <CopyButton text={cvText(kit.cv)} label="Copy as text" />
            <label className="ml-auto inline-flex items-center gap-2 text-[15px]">
              <input type="checkbox" checked={showSources} onChange={(e) => setShowSources(e.target.checked)} className="size-5 accent-[var(--accent)]" />
              Show where each line came from
            </label>
          </div>
          <CvPaper cv={kit.cv} facts={facts} showSources={showSources} />
          <PrintSheet cv={kit.cv} />
        </div>
      )}

      {tab === "letter" && kit.letter && (
        <div role="tabpanel" className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={async () => download(await toBlob(letterDocx(kit.letter!, kit.cv.header, app.job.title)), letterFileName(app.job.company, app.job.title, name))}>
              <DownloadSimple size={18} aria-hidden />
              Download Word
            </Button>
            <CopyButton text={["Dear Hiring Team,", "", ...kit.letter.paragraphs.map((p) => p.text), "", "Kind regards,", name].join("\n\n")} />
          </div>
          <div className="grid max-w-[70ch] gap-4 rounded-surface border border-line bg-white p-8 text-[15px] leading-relaxed text-[#1a1a1a] shadow-lift">
            <p>Dear Hiring Team,</p>
            <p className="font-bold">Re: {app.job.title}</p>
            {kit.letter.paragraphs.map((p, i) => (
              <p key={i}>{p.text}</p>
            ))}
            <p>
              Kind regards,
              <br />
              {name}
            </p>
          </div>
        </div>
      )}

      {tab === "answers" && kit.answers && (
        <div role="tabpanel" className="grid gap-3">
          {kit.answers.answers.map((a, i) => (
            <div key={i} className="rounded-surface border border-line bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-bold">{a.question}</h3>
                {a.answer && <CopyButton text={a.answer} />}
              </div>
              {a.answer ? <p className="mt-2 text-ink-2">{a.answer}</p> : <p className="mt-2 text-sm text-ink-3">Only you can answer this one.</p>}
            </div>
          ))}
        </div>
      )}

      {tab === "checks" && (
        <div role="tabpanel" className="grid gap-4">
          <Notice tone={kit.events.length ? "warn" : "ok"}>
            <span className="inline-flex items-start gap-2">
              <ShieldCheck size={20} className="mt-0.5 shrink-0" aria-hidden />
              {kit.events.length
                ? `Deis removed ${kit.events.length} ${kit.events.length === 1 ? "thing" : "things"} Gemma wrote that your facts don't back up. They're below, so you can see what a model would have claimed.`
                : "Every line in this kit traces back to a fact you confirmed. Nothing needed removing."}
            </span>
          </Notice>
          {kit.events.length > 0 && (
            <ul className="grid gap-2">
              {kit.events.map((e, i) => (
                <li key={i} className="rounded-control border border-line bg-surface p-3 text-[15px]">
                  <span className="block text-sm font-bold text-amber">{RULE_COPY[e.rule] ?? e.rule}</span>
                  <s className="text-ink-2">{e.text}</s>
                </li>
              ))}
            </ul>
          )}
          {repairs.length > 0 && (
            <div className="grid gap-2">
              <p className="text-[15px] text-ink-2">
                Deis kept {repairs.length === 1 ? "this line" : `these ${repairs.length} lines`} by adding one more of your facts as {repairs.length === 1 ? "its source" : "their source"}. Check {repairs.length === 1 ? "it says" : "they say"} only what that fact says.
              </p>
              <ul className="grid gap-2">
                {repairs.map((r, i) => (
                  <li key={i} className="rounded-control border border-line bg-surface p-3 text-[15px]">
                    {r.text}
                    <Sources ids={r.ids} facts={facts} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="max-w-[70ch] text-sm text-ink-3">
            Code checks numbers, tools, certificates, employers and dates. It can&apos;t judge every shade of meaning, so read the CV once before you send it. Turn on &ldquo;Show where each line came from&rdquo; to check any line in a second.
          </p>
        </div>
      )}
    </section>
  );
}

function Coach({ app, onBuilt }: { app: Application; onBuilt: () => void }) {
  const [questions, setQuestions] = useState<GapQuestions["questions"] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [proposals, setProposals] = useState<(Proposals["proposals"][number] & { key: string; state: "new" | "added" | "skipped" })[]>([]);
  const [busy, setBusy] = useState<{ what: string; since: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !app.fit) return;
    started.current = true;
    api<GapQuestions>("/api/questions", { job: app.job, fit: app.fit })
      .then((r) => setQuestions(r.questions))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't get questions."));
  }, [app.fit, app.job]);

  const suggest = async () => {
    if (!questions) return;
    setBusy({ what: "Turning your answers into facts", since: Date.now() });
    setError(null);
    const profile = await loadProfile();
    const orgs = [...new Set(profile.facts.map((f) => f.org).filter((o): o is string => Boolean(o)))];
    const out: typeof proposals = [];
    for (const [i, q] of questions.entries()) {
      const a = answers[i]?.trim();
      if (!a || a.length < 3) continue;
      try {
        const r = await api<Proposals>("/api/proposals", { need: q.need, question: q.question, answer: a, orgs });
        out.push(...r.proposals.map((p, j) => ({ ...p, key: `${i}-${j}`, state: "new" as const })));
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Couldn't read an answer.");
      }
    }
    setProposals(out);
    setBusy(null);
  };

  const build = async () => {
    setBusy({ what: "Checking the fit again and writing your kit", since: Date.now() });
    setError(null);
    try {
      const profile = await loadProfile();
      const added = proposals.some((p) => p.state === "added");
      const { fit, events } = added || !app.fit ? await runFit(app.job, profile) : { fit: app.fit, events: app.fitEvents };
      await updateApplication(app.id, { fit, fitEvents: events });
      const kit = await runKit(app.job, profile, fit);
      await updateApplication(app.id, { kit, kitError: null });
      onBuilt();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The kit couldn't be built.");
    } finally {
      setBusy(null);
    }
  };

  const addProposal = async (key: string) => {
    const p = proposals.find((x) => x.key === key);
    if (!p) return;
    await db.facts.put({ id: newFactId(), kind: p.kind, text: p.text, org: p.org ?? null, source: "answer", confirmed: true, createdAt: new Date().toISOString() });
    setProposals((ps) => ps.map((x) => (x.key === key ? { ...x, state: "added" } : x)));
  };

  return (
    <section aria-labelledby="coach" className="grid gap-4 rounded-surface border border-line bg-surface p-6">
      <h2 id="coach" className="text-xl font-bold">
        Before Deis writes anything: your gaps
      </h2>
      <p className="max-w-[64ch] text-ink-2">Coursework, final-year projects, part-time jobs, societies and volunteering all count. Answer what you can and skip the rest. Nothing is added to your profile unless you say so.</p>
      {!questions && !error && (
        <div className="grid gap-3" aria-busy="true">
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-20 w-full" />
        </div>
      )}
      {questions?.length === 0 && <p>No real gaps for this one. Build your kit.</p>}
      {questions?.map((q, i) => (
        <Field key={i} label={q.question} help={`About: ${q.need}`}>
          {(id, d) => <textarea id={id} aria-describedby={d} rows={3} value={answers[i] ?? ""} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} className={textareaClass} placeholder="Leave empty if you haven't done this" />}
        </Field>
      ))}

      {proposals.length > 0 && (
        <div className="grid gap-2">
          <h3 className="font-bold">Add these to your profile?</h3>
          {proposals.map((p) => (
            <div key={p.key} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line p-3">
              <span className={p.state === "skipped" ? "text-ink-3 line-through" : ""}>
                {p.text}
                {p.org && <span className="text-ink-3">, at {p.org}</span>}
              </span>
              {p.state === "new" ? (
                <span className="flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => addProposal(p.key)}>
                    Add
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setProposals((ps) => ps.map((x) => (x.key === p.key ? { ...x, state: "skipped" } : x)))}>
                    Skip
                  </Button>
                </span>
              ) : (
                <span className="text-sm text-ink-3">{p.state === "added" ? "Added" : "Skipped"}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      {busy && (
        <Notice>
          {busy.what}… <Elapsed since={busy.since} />
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        {questions && questions.length > 0 && Object.values(answers).some((a) => a.trim()) && !proposals.length && (
          <Button onClick={suggest} disabled={Boolean(busy)}>
            Suggest facts from my answers
          </Button>
        )}
        <Button variant="primary" onClick={build} disabled={Boolean(busy) || !app.fit}>
          Build my kit
        </Button>
      </div>
    </section>
  );
}

/** Right to work, from code: what the posting says (quoted) and what it means for the user's own status. */
function WorkLine({ description }: { description: string }) {
  const { profile } = useStore();
  const rtw = readRightToWork(description);
  if (rtw.stance === "unknown") return null;
  const status = profile?.preferences.workStatus ?? null;
  const fit = workFit(rtw.stance, status);
  const meaning =
    fit === "blocked" ? "This rules out your status, so think twice before applying." : fit === "check" ? "Check this fits your situation before you apply." : status ? "That fits your status." : "Set your status in Profile and Deis will check this for you.";
  return (
    <div className={`rounded-control px-4 py-3 text-[15px] ${fit === "ok" ? "bg-surface-2" : fit === "check" ? "bg-amber-soft" : "bg-brick-soft"}`}>
      <p className="font-medium">
        {WORK_FIT_COPY[rtw.stance]}. {meaning}
      </p>
      {rtw.evidence && (
        <p className="mt-1 text-sm text-ink-2">
          The posting says: <q>{rtw.evidence}</q>
        </p>
      )}
      {status && <p className="mt-1 text-sm text-ink-3">Your status: {WORK_STATUS_LABEL[status]}. Deis checks this with code; it isn&apos;t immigration advice.</p>}
    </div>
  );
}

export function ApplicationScreen({ id }: { id: string }) {
  const app = useLiveQuery(() => db.applications.get(id), [id]);
  const factsList = useLiveQuery(() => db.facts.toArray(), [], []);
  const facts = useMemo(() => new Map(factsList.map((f) => [f.id, f])), [factsList]);
  const queue = useKitQueue();
  const locked = useStore().licence?.state === "locked";
  const [fitState, setFitState] = useState<{ since: number } | null>(null);
  const [fitError, setFitError] = useState<string | null>(null);
  const [fitAttempt, setFitAttempt] = useState(0);
  const started = useRef(false);
  const retryFit = () => {
    started.current = false;
    setFitError(null);
    setFitAttempt((n) => n + 1);
  };

  // The Careful lane runs the fit check here; the Quick lane's background queue does its own.
  useEffect(() => {
    if (!app || app.fit || app.lane !== "careful" || locked || started.current) return;
    started.current = true;
    setFitState({ since: Date.now() });
    (async () => {
      try {
        const out = await runFit(app.job, await loadProfile());
        await updateApplication(app.id, { fit: out.fit, fitEvents: out.events });
      } catch (e) {
        setFitError(e instanceof ApiError ? e.message : "Couldn't check the fit.");
      } finally {
        setFitState(null);
      }
    })();
  }, [app, fitAttempt, locked]);

  if (app === undefined) return null;
  if (!app)
    return (
      <div className="grid gap-4">
        <p>That application isn&apos;t here any more.</p>
        <a href={routeHref({ name: "tracker" })} className="text-accent-text underline">
          Back to applications
        </a>
      </div>
    );

  const job = app.job;
  const setStatus = (status: Status) => updateApplication(app.id, { status, appliedAt: status === "applied" && !app.appliedAt ? Date.now() : app.appliedAt });

  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <a href={routeHref({ name: "tracker" })} className="inline-flex w-fit items-center gap-1 text-sm text-ink-2 hover:text-ink">
          <ArrowLeft size={16} aria-hidden />
          Applications
        </a>
        <p className="font-bold text-ink-2">{job.company}</p>
        <h1 className="text-3xl font-bold leading-tight text-balance">{job.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-ink-2">
          <span>{job.location}</span>
          <LevelBadge job={job} />
          <span className="text-sm text-ink-3">{app.lane === "careful" ? "Careful lane" : "Quick lane"}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {job.apply.slice(0, 2).map((a) => (
            <LinkButton key={a.url} href={a.url} variant={app.kit ? "primary" : "secondary"}>
              Apply on {a.label}
            </LinkButton>
          ))}
          <label className="ml-auto inline-flex items-center gap-2 text-[15px]">
            Status
            <select value={app.status} onChange={(e) => setStatus(e.target.value as Status)} className="h-11 rounded-control border border-line bg-surface px-3">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <section aria-labelledby="fit" className="grid gap-4">
        <h2 id="fit" className="text-xl font-bold">
          How you fit
        </h2>
        <WorkLine description={job.description} />
        {!app.fit ? (
          fitError ? (
            <Notice tone="error">
              {fitError}{" "}
              <button className="font-medium underline" onClick={retryFit}>
                Try again
              </button>
            </Notice>
          ) : app.kitError || locked ? (
            <p className="text-ink-2">Not checked yet.</p>
          ) : (
            <Notice>
              Gemma is comparing the posting to your facts…{" "}
              {fitState ? <Elapsed since={fitState.since} /> : queue.working === app.id && queue.since ? <Elapsed since={queue.since} /> : queue.waiting > 0 ? "Waiting its turn." : null}
            </Notice>
          )
        ) : (
          <div className="grid gap-4 rounded-surface border border-line bg-surface p-6">
            <p className="text-lg">
              <strong>{VERDICT[app.fit.verdict]}.</strong> <span className="text-ink-2">{app.fit.angle}</span>
            </p>
            <ul className="grid gap-3">
              {app.fit.requirements.map((r, i) => (
                <li key={i} className="flex items-start gap-3">
                  {r.match === "strong" ? (
                    <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-accent" aria-label="Strong:" />
                  ) : r.match === "transferable" ? (
                    <ArrowsLeftRight size={22} className="mt-0.5 shrink-0 text-ink-2" aria-label="Carries over:" />
                  ) : (
                    <CircleDashed size={22} className="mt-0.5 shrink-0 text-amber" aria-label="Gap:" />
                  )}
                  <span>
                    <span className="font-medium">{r.need}</span>
                    {r.note && <span className="block text-[15px] text-ink-2">{r.note}</span>}
                    {r.facts.length > 0 && <span className="block text-sm text-ink-3">From: {r.facts.map((id) => facts.get(id)?.text).filter(Boolean).join(" | ")}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {app.kit ? (
        <KitView app={app} kit={app.kit} facts={facts} />
      ) : app.lane === "careful" ? (
        app.fit && !locked && <Coach app={app} onBuilt={() => undefined} />
      ) : app.kitError ? (
        <Notice tone="error">
          {app.kitError}{" "}
          <button className="font-medium underline" onClick={() => updateApplication(app.id, { kitError: null })}>
            Try again
          </button>
        </Notice>
      ) : (
        app.fit && (
          <Notice>
            Writing your CV, letter and answers… {queue.working === app.id && queue.since ? <Elapsed since={queue.since} /> : "Waiting its turn."}
          </Notice>
        )
      )}

      {app.kit && (
        <div className="flex flex-wrap gap-2">
          {app.status === "ready" && (
            <Button variant="primary" onClick={() => setStatus("applied")}>
              I&apos;ve applied
            </Button>
          )}
          {app.lane === "quick" && (
            <Button
              onClick={async () => {
                await updateApplication(app.id, { lane: "careful", kit: null });
              }}
            >
              Go through my gaps and rebuild
            </Button>
          )}
        </div>
      )}

      <section aria-labelledby="notes" className="grid max-w-2xl gap-2">
        <h2 id="notes" className="text-xl font-bold">
          Notes
        </h2>
        <label htmlFor="notes-box" className="sr-only">
          Notes about this application
        </label>
        <textarea id="notes-box" rows={3} defaultValue={app.notes} onBlur={(e) => updateApplication(app.id, { notes: e.target.value })} className={textareaClass} placeholder="Who you spoke to, referral, interview dates" />
      </section>
    </div>
  );
}
