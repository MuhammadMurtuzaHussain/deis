"use client";

import { useEffect, useRef, useState } from "react";
import type { GapQuestions, Proposals } from "@/lib/cv/schema";
import { api, ApiError } from "@/lib/client/api";
import { db, getMeta, loadProfile, setMeta, type Application } from "@/lib/client/db";
import { runFit, runKit, updateApplication } from "@/lib/client/kit";
import { progressLine, progressStart, withEvent } from "@/lib/kit-progress";
import { newFactId } from "@/lib/profile/types";
import { Button, Elapsed, Field, Notice, Skeleton, textareaClass, toast } from "../ui";
import { mergeRewrite } from "./trace";

// The Careful lane: Gemma asks about the gaps, the answers become proposed facts, and
// only what the user adds goes into the profile. Drafts are kept in IndexedDB until the
// kit is built, so leaving the screen loses nothing (CH-20). When rebuilding, the kit on
// screen stays until the new one is saved.

type Proposal = Proposals["proposals"][number] & { key: string; state: "new" | "added" | "skipped" };
type Draft = { questions: GapQuestions["questions"] | null; answers: Record<number, string>; proposals: Proposal[] };

const draftKey = (id: string) => `coach.${id}`;

export function Coach({ app, onBuilt, onCancel }: { app: Application; onBuilt: () => void; onCancel?: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<{ what: string; since: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const rebuilding = Boolean(app.kit);

  // Load a saved draft, or ask for the questions.
  useEffect(() => {
    if (started.current || !app.fit) return;
    started.current = true;
    (async () => {
      const saved = await getMeta<Draft | null>(draftKey(app.id), null);
      if (saved?.questions) return setDraft(saved);
      setDraft({ questions: null, answers: {}, proposals: [] });
      try {
        const r = await api<GapQuestions>("/api/questions", { job: app.job, fit: app.fit });
        setDraft((d) => ({ ...(d ?? { answers: {}, proposals: [] }), questions: r.questions }));
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Couldn't get questions.");
      }
    })();
  }, [app.fit, app.job, app.id]);

  // Save the draft a moment after each change.
  useEffect(() => {
    if (!draft?.questions) return;
    const t = setTimeout(() => void setMeta(draftKey(app.id), draft), 400);
    return () => clearTimeout(t);
  }, [draft, app.id]);

  const questions = draft?.questions ?? null;
  const answers = draft?.answers ?? {};
  const proposals = draft?.proposals ?? [];
  const setAnswer = (i: number, v: string) => setDraft((d) => d && { ...d, answers: { ...d.answers, [i]: v } });
  const setProposals = (f: (ps: Proposal[]) => Proposal[]) => setDraft((d) => d && { ...d, proposals: f(d.proposals) });

  const suggest = async () => {
    if (!questions) return;
    setBusy({ what: "Turning your answers into facts.", since: Date.now() });
    setError(null);
    try {
      const profile = await loadProfile();
      const orgs = [...new Set(profile.facts.map((f) => f.org).filter((o): o is string => Boolean(o)))];
      const out: Proposal[] = [];
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
      setProposals(() => out);
      if (!out.length) setError((e) => e ?? "Deis couldn't find a fact in those answers. Add more detail, or build the kit as it is.");
    } finally {
      setBusy(null);
    }
  };

  const build = async () => {
    setBusy({ what: rebuilding ? "Checking the fit again and writing a new kit." : "Checking the fit again and writing your kit.", since: Date.now() });
    setError(null);
    try {
      const profile = await loadProfile();
      const added = proposals.some((p) => p.state === "added");
      if (app.lane !== "careful") await updateApplication(app.id, { lane: "careful" });
      const refit = added || !app.fit;
      const { fit, events } = refit ? await runFit(app.job, profile) : { fit: app.fit!, events: app.fitEvents };
      await updateApplication(app.id, { fit, fitEvents: events });
      // The workflow's steps, as they happen: what's written and what the guard removed.
      let progress = progressStart(refit ? "done" : null);
      const show = () => setBusy((b) => b && { ...b, what: progressLine(progress) });
      show();
      const next = await runKit(app.job, profile, fit, (e) => {
        progress = withEvent(progress, e);
        show();
      });
      await updateApplication(app.id, { kit: app.kit ? mergeRewrite(app.kit, next) : next, kitError: null });
      await db.meta.delete(draftKey(app.id));
      toast(rebuilding ? "Your new kit is ready." : "Your kit is ready.");
      onBuilt();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : rebuilding ? "The new kit couldn't be built. Your current kit is unchanged." : "The kit couldn't be built.");
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
    <section aria-labelledby="coach" className="grid gap-5 rounded-panel bg-surface p-5 shadow-card sm:p-6">
      <div>
        <h2 id="coach" className="text-lead font-semibold tracking-[-0.01em] text-ink">
          {rebuilding ? "Go through your gaps, then rebuild" : "Before Deis writes anything: your gaps"}
        </h2>
        <p className="mt-1 max-w-[64ch] text-body text-ink-2">
          Coursework, final-year projects, part-time jobs, societies and volunteering all count. Answer what you can and skip the rest. Nothing is added to your profile unless you say so.
          {rebuilding && " Your current kit stays until the new one is saved."}
        </p>
      </div>
      {!questions && !error && (
        <div className="grid gap-3" aria-busy="true">
          <span className="sr-only" role="status">
            Getting questions about your gaps
          </span>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}
      {questions?.length === 0 && <p className="text-body text-ink-2">No real gaps for this one. Build your kit.</p>}
      {questions?.map((q, i) => (
        <Field key={i} label={q.question} help={`About: ${q.need}`}>
          {(id, d) => <textarea id={id} aria-describedby={d} rows={3} value={answers[i] ?? ""} onChange={(e) => setAnswer(i, e.target.value)} className={textareaClass} placeholder="Leave empty if you haven't done this" />}
        </Field>
      ))}

      {proposals.length > 0 && (
        <div className="grid gap-2">
          <h3 className="font-semibold text-ink">Add these to your profile?</h3>
          {proposals.map((p) => (
            <div key={p.key} className="flex flex-wrap items-center justify-between gap-3 rounded-field border border-line bg-surface p-3 pl-4 text-body">
              <span className={p.state === "skipped" ? "text-ink-3 line-through" : "text-ink"}>
                {p.text}
                {p.org && <span className="text-ink-3">, at {p.org}</span>}
              </span>
              {p.state === "new" ? (
                <span className="flex gap-2">
                  <Button size="sm" onClick={() => addProposal(p.key)}>
                    Add
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setProposals((ps) => ps.map((x) => (x.key === p.key ? { ...x, state: "skipped" } : x)))}>
                    Skip
                  </Button>
                </span>
              ) : (
                <span className="text-caption text-ink-3">{p.state === "added" ? "Added" : "Skipped"}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      {busy && (
        <Notice>
          {busy.what} <Elapsed since={busy.since} />
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={build} disabled={Boolean(busy) || !app.fit}>
          {rebuilding ? "Rebuild my kit" : "Build my kit"}
        </Button>
        {questions && questions.length > 0 && Object.values(answers).some((a) => a.trim()) && !proposals.length && (
          <Button onClick={suggest} disabled={Boolean(busy)}>
            Suggest facts from my answers
          </Button>
        )}
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={Boolean(busy)}>
            Keep my current kit
          </Button>
        )}
      </div>
    </section>
  );
}
