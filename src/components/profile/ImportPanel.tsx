"use client";

import { ClipboardText, FileArrowUp, LinkedinLogo } from "@phosphor-icons/react";
import { useRef, useState, type DragEvent } from "react";
import { Button, Dialog, Elapsed, Field, Notice, textareaClass } from "../ui";

// Import as a drop zone: a CV (PDF or Word), a LinkedIn PDF or a LinkedIn data export ZIP,
// dropped or chosen, or text pasted in. The reading itself stays in ProfileScreen (onFile,
// onText) so the existing import flows are unchanged.

export type ImportState = { state: "idle" | "reading" | "ai" | "done" | "error"; message?: string; since?: number };

export function ImportPanel({
  state,
  onFile,
  onText,
  privacyLine,
  primary = true,
}: {
  state: ImportState;
  onFile: (f: File) => void;
  onText: (text: string) => void;
  /** Where the text goes to be split into facts, from effectiveModel. */
  privacyLine: string;
  /** Choose a file is the page's lime action only while there's nothing else to do. */
  primary?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const busy = state.state === "reading" || state.state === "ai";

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && !busy) onFile(f);
  };

  return (
    <div className="grid gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`grid gap-5 rounded-panel border-[1.5px] border-dashed px-5 py-6 transition-colors sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-6 ${over ? "border-ink bg-sunken" : "border-control-border bg-surface"}`}
      >
        <span aria-hidden className="grid size-12 place-items-center rounded-full bg-sunken text-ink-2">
          <FileArrowUp size={24} />
        </span>
        <div className="min-w-0">
          <p className="text-[16px] font-semibold text-ink">Drop a CV or LinkedIn file here</p>
          <p className="mt-1 text-caption text-ink-2">PDF or Word CV, LinkedIn &ldquo;Save to PDF&rdquo;, or LinkedIn&apos;s data export ZIP</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={primary ? "primary" : "secondary"} busy={state.state === "reading"} disabled={busy} onClick={() => fileRef.current?.click()}>
            Choose a file
          </Button>
          <Button disabled={busy} onClick={() => setPasteOpen(true)}>
            <ClipboardText size={18} aria-hidden />
            Paste text
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.zip"
          className="sr-only"
          tabIndex={-1}
          aria-label="Upload a CV, LinkedIn PDF or LinkedIn data export"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        <p className="max-w-[72ch] border-t border-line pt-4 text-caption text-ink-2 sm:col-span-3">{privacyLine}</p>
      </div>

      <details className="max-w-[70ch] text-body text-ink-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-pill font-medium text-ink">
          <LinkedinLogo size={18} aria-hidden />
          Getting your LinkedIn into Deis
        </summary>
        <div className="mt-2 grid gap-2 pl-1">
          <p>LinkedIn doesn&apos;t let apps read profiles, so there are two ways in, both from your own account:</p>
          <p>
            <strong className="text-ink">Quickest:</strong> open your profile, choose <em>More</em>, then <em>Save to PDF</em>, and drop that PDF here.
          </p>
          <p>
            <strong className="text-ink">Most complete:</strong> Settings, <em>Data privacy</em>, <em>Get a copy of your data</em>. Pick Positions, Education, Skills and Profile. LinkedIn emails a ZIP in about ten minutes; drop it here as it is. Deis reads it without any AI.
          </p>
        </div>
      </details>

      {state.state === "reading" && <Notice>Reading the file on this device.</Notice>}
      {state.state === "ai" && (
        <Notice>
          Gemma is splitting your CV into facts. <Elapsed since={state.since ?? 0} />
        </Notice>
      )}
      {state.state === "done" && <Notice tone="ok">{state.message}</Notice>}
      {state.state === "error" && <Notice tone="error">{state.message}</Notice>}

      <Dialog
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        title="Paste your CV or LinkedIn text"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPasteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={paste.trim().length < 80}
              onClick={() => {
                setPasteOpen(false);
                onText(paste);
              }}
            >
              Read it
            </Button>
          </>
        }
      >
        <Field label="Text" help="Copy everything from your CV, or your LinkedIn About and Experience sections.">
          {(id, d) => <textarea id={id} aria-describedby={d} rows={12} value={paste} onChange={(e) => setPaste(e.target.value)} className={textareaClass} />}
        </Field>
      </Dialog>
    </div>
  );
}
