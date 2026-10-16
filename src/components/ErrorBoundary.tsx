"use client";

import { ArrowClockwise, DownloadSimple } from "@phosphor-icons/react";
import { Component, useState, type ErrorInfo, type ReactNode } from "react";

// A render error or a broken IndexedDB shouldn't leave a white screen with no way to
// save your work (CH-3). This catches errors under the shell; src/app/global-error.tsx
// catches the rest. Both offer Reload and a best-effort backup download.

/** Download everything Deis has in this browser as JSON. Resolves false if the database can't be read. */
export async function downloadBackup(): Promise<boolean> {
  try {
    const { exportAll } = await import("@/lib/client/db");
    const data = await exportAll();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    Object.assign(document.createElement("a"), { href: url, download: `deis-backup-${new Date().toISOString().slice(0, 10)}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

/** The recovery panel, shared with global-error.tsx. Plain classes only, so it works without the app's state. */
export function Recovery({ onRetry }: { onRetry?: () => void }) {
  const [backup, setBackup] = useState<"idle" | "busy" | "done" | "failed">("idle");
  return (
    <div role="alert" className="mx-auto grid max-w-lg gap-4 rounded-surface bg-raised p-6 shadow-card sm:p-8">
      <h1 className="display text-title text-ink sm:text-page">Something went wrong</h1>
      <p className="text-body text-ink-2">
        Deis hit an error and stopped this screen. Your profile and applications are stored on this device and are most likely fine. Reload to try again. If it keeps happening, download a backup first.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => location.reload()} className="inline-flex h-11 items-center gap-2 rounded-control bg-accent px-4 text-body font-medium text-accent-ink hover:brightness-110">
          <ArrowClockwise size={18} aria-hidden />
          Reload
        </button>
        <button
          type="button"
          disabled={backup === "busy"}
          onClick={async () => {
            setBackup("busy");
            setBackup((await downloadBackup()) ? "done" : "failed");
          }}
          className="inline-flex h-11 items-center gap-2 rounded-control border border-control-border bg-raised px-4 text-body font-medium text-ink hover:bg-wash disabled:opacity-50"
        >
          <DownloadSimple size={18} aria-hidden />
          Download a backup
        </button>
        {onRetry && (
          <button type="button" onClick={onRetry} className="inline-flex h-11 items-center rounded-control px-4 text-body font-medium text-ink-2 hover:bg-wash hover:text-ink">
            Try this screen again
          </button>
        )}
      </div>
      {backup === "done" && <p className="text-caption text-ink-2">Backup downloaded. You can restore it in Settings.</p>}
      {backup === "failed" && <p className="text-caption font-medium text-brick">The backup couldn&apos;t be made: this browser&apos;s storage isn&apos;t answering. Try reloading first.</p>}
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
