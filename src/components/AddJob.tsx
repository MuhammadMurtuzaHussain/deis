"use client";

import { ClipboardText } from "@phosphor-icons/react";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { db, saveJobs } from "@/lib/client/db";
import { useStore } from "@/lib/client/store";
import type { ScoredJob } from "@/lib/jobs/types";
import { buildPastedJob, cleanLink, MAX_POSTING } from "./deck/logic";
import { Button, Dialog, Field, inputClass, Notice, textareaClass, toast, type Variant } from "./ui";

// Paste a job you found elsewhere (OFF-2, PRD-5). The job is built in the browser with the
// same code as the boards (sanitised, levelled, right to work read), saved to this device
// and put on top of the deck. It works with no internet: only the link needs one, and it's
// optional.

type Draft = { title: string; company: string; location: string; text: string; link: string };
const EMPTY: Draft = { title: "", company: "", location: "", text: "", link: "" };

/** A button that opens the paste-a-job dialog. Used by the deck header, its empty state and the tracker. */
export function AddJobButton({
  variant = "secondary",
  label = "Paste a job",
  size = "md",
  className = "",
  onAdded,
}: {
  variant?: Variant;
  label?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** After saving. Without it, Deis says where the job went and offers to show it. */
  onAdded?: (job: ScoredJob) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <ClipboardText size={18} aria-hidden />
        {label}
      </Button>
      <AddJobDialog open={open} onClose={() => setOpen(false)} onAdded={onAdded} />
    </>
  );
}

export function AddJobDialog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded?: (job: ScoredJob) => void }) {
  const { isOffline, route, go } = useStore();
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  const errors = {
    title: draft.title.trim() ? null : "Add the job title.",
    company: draft.company.trim() ? null : "Add the company.",
    text: draft.text.trim().length >= 40 ? null : "Paste the posting itself: what the job involves and what it asks for.",
    link: !draft.link.trim() || cleanLink(draft.link) ? null : "That isn't a web link. Leave it empty if you don't have one.",
  };
  const show = (k: keyof typeof errors) => (tried ? errors[k] : null);

  const close = () => {
    setTried(false);
    setFailed(null);
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.values(errors).some(Boolean)) {
      // Take keyboard and screen reader users to the first thing to fix.
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      const { job, clipped } = buildPastedJob({ ...draft, link: isOffline ? "" : draft.link });
      const applied = await db.applications.get(job.id);
      await saveJobs([job], Date.now(), { feed: false });
      // Pasting a job you skipped earlier means you want it after all.
      const swipe = await db.swipes.get(job.id);
      if (swipe && swipe.dir !== "apply") await db.swipes.delete(job.id);
      setDraft(EMPTY);
      close();
      if (applied) {
        toast({ message: `You already have an application for ${job.title}.`, action: { label: "Open it", run: () => go({ name: "application", id: job.id }) } });
      } else if (onAdded) {
        onAdded(job);
      } else {
        const where = clipped ? " Deis kept the first part of a very long posting." : "";
        toast(
          route?.name === "deck"
            ? `Added ${job.title} to the top of your deck.${where}`
            : { message: `Added ${job.title} to the top of your deck.${where}`, action: { label: "Show me", run: () => go({ name: "deck" }) } },
        );
      }
    } catch {
      setFailed("Deis couldn't save that job on this device. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      wide
      title="Paste a job"
      description="Found a job somewhere else? Paste it here and Deis treats it like any other: it checks the level and right to work, and tailors a kit if you apply."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} busy={busy}>
            Add to my deck
          </Button>
        </>
      }
    >
      <form ref={formRef} id={formId} onSubmit={submit} noValidate className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Job title" error={show("title")}>
            {(id, d) => <input id={id} aria-describedby={d} aria-invalid={Boolean(show("title"))} className={inputClass} value={draft.title} onChange={set("title")} autoComplete="off" maxLength={300} required />}
          </Field>
          <Field label="Company" error={show("company")}>
            {(id, d) => <input id={id} aria-describedby={d} aria-invalid={Boolean(show("company"))} className={inputClass} value={draft.company} onChange={set("company")} autoComplete="organization" maxLength={200} required />}
          </Field>
        </div>
        <Field label="Where" help="A town or city in Ireland, and whether it's remote. Optional.">
          {(id, d) => <input id={id} aria-describedby={d} className={inputClass} value={draft.location} onChange={set("location")} placeholder="Dublin, hybrid" maxLength={300} />}
        </Field>
        <Field label="The posting" help={`Copy everything from the job page. Hidden or AI-addressed text is set aside and shown to you, never followed. Up to ${MAX_POSTING.toLocaleString("en-IE")} characters are used.`} error={show("text")}>
          {(id, d) => <textarea id={id} aria-describedby={d} aria-invalid={Boolean(show("text"))} className={`${textareaClass} min-h-48`} value={draft.text} onChange={set("text")} rows={8} required />}
        </Field>
        <Field
          label="Link to the posting"
          help={isOffline ? "You're offline, so the link is off for now. Deis only needs the text." : "Optional. Kept so you can open the posting when you apply."}
          error={isOffline ? null : show("link")}
        >
          {(id, d) => (
            <input
              id={id}
              aria-describedby={d}
              aria-invalid={!isOffline && Boolean(show("link"))}
              className={inputClass}
              type="url"
              inputMode="url"
              value={isOffline ? "" : draft.link}
              onChange={set("link")}
              disabled={isOffline}
              placeholder="https://"
            />
          )}
        </Field>
        {failed && <Notice tone="error">{failed}</Notice>}
      </form>
    </Dialog>
  );
}
