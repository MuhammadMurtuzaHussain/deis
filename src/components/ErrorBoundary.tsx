"use client";

import { ArrowClockwise, DownloadSimple, WarningOctagon } from "@phosphor-icons/react";
import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { buttonClass } from "./ui";

// A render error or a broken IndexedDB shouldn't leave a white screen with no way to
// save your work (CH-3). This catches errors under the shell; src/app/global-error.tsx
// catches the rest. Both offer Reload and a best-effort backup download.

/** Download everything Deis has in this browser as JSON. Resolves false if the database can't be read. */
export async function downloadBackup(): Promise<boolean> {
  try {
    const { exportAll } = await import("@/lib/client/db");
    const { saveFile } = await import("@/lib/client/files");
    const data = await exportAll();
    await saveFile(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `deis-backup-${new Date().toISOString().slice(0, 10)}.json`);
    return true;
  } catch {
    return false;
  }
}

/** The recovery panel, shared with global-error.tsx. Plain classes only, so it works without the app's state. */
export function Recovery({ onRetry }: { onRetry?: () => void }) {
  const [backup, setBackup] = useState<"idle" | "busy" | "done" | "failed">("idle");
  return (
    <div role="alert" className="mx-auto grid max-w-xl gap-5 rounded-panel border border-line bg-surface p-6 sm:p-8">
      <span aria-hidden className="grid size-11 place-items-center rounded-full bg-danger-soft text-danger">
        <WarningOctagon size={22} weight="fill" />
      </span>
      <div className="grid gap-2">
        <h1 data-page-title tabIndex={-1} className="display text-[28px] leading-[1.1] text-ink sm:text-[32px]">
          Something went wrong
        </h1>
        <p className="max-w-[60ch] text-body text-ink-2">
          Deis hit an error and stopped this screen. Your profile and applications are stored on this device and are most likely fine. Reload to try again. If it keeps happening, download a backup first.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => location.reload()} className={buttonClass("primary")}>
          <ArrowClockwise size={18} aria-hidden />
          Reload
        </button>
        <button
          type="button"
          disabled={backup === "busy"}
          aria-busy={backup === "busy" || undefined}
          onClick={async () => {
            setBackup("busy");
            setBackup((await downloadBackup()) ? "done" : "failed");
          }}
          className={buttonClass("secondary")}
        >
          <DownloadSimple size={18} aria-hidden />
          Download a backup
        </button>
        {onRetry && (
          <button type="button" onClick={onRetry} className={buttonClass("ghost")}>
            Try this screen again
          </button>
        )}
      </div>
      {backup === "done" && <p className="text-caption text-ink-2">Backup downloaded. You can restore it in Settings.</p>}
      {backup === "failed" && <p className="text-caption font-medium text-danger">The backup couldn&apos;t be made: this browser&apos;s storage isn&apos;t answering. Try reloading first.</p>}
    </div>
  );
}

type Props = { children: ReactNode; /** Changing this (e.g. the route) clears the error. */ resetKey?: string };
type State = { error: Error | null; key?: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // A new route gets a fresh try.
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[deis] screen error", error, info.componentStack);
  }

  render() {
    if (this.state.error) return <Recovery onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}
