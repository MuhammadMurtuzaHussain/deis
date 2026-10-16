"use client";

import { ArrowRight, DownloadSimple, Laptop, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { routeHref, useStore } from "@/lib/client/store";
import { CopyLine } from "./settings/parts";
import { Button, buttonClass } from "./ui";

// Gemma on the user's own computer is the best way to use Deis: no shared limits, no
// waiting on a busy host, and nothing leaves the laptop. Everyone who tried the shared
// demo key at once hit its rate limit, so the web demo says so plainly and the desktop
// app sets Gemma up in a couple of clicks.

export type DesktopOs = "mac" | "windows" | "linux";

/** Ollama's own installers. Linux has no file: its one-line install script is the official way. */
export const OLLAMA_DOWNLOADS: Record<DesktopOs, { label: string; url?: string; command?: string }> = {
  mac: { label: "Download Ollama for Mac", url: "https://ollama.com/download/Ollama.dmg" },
  windows: { label: "Download Ollama for Windows", url: "https://ollama.com/download/OllamaSetup.exe" },
  linux: { label: "Install Ollama on Linux", command: "curl -fsSL https://ollama.com/install.sh | sh" },
};

export function desktopOs(): DesktopOs | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const ua = navigator.userAgent;
  if (/android|iphone|ipad|ipod/i.test(ua)) return null;
  const platform = nav.userAgentData?.platform ?? navigator.platform ?? "";
  if (/mac/i.test(platform) || /Macintosh/.test(ua)) return "mac";
  if (/win/i.test(platform)) return "windows";
  if (/linux/i.test(platform)) return "linux";
  return null;
}

/** The Ollama download for this computer: a button, or Linux's one command to copy. */
const noSubscribe = () => () => {};

/** short: "Download for Mac", for a narrow card already headed "Install Ollama". */
export function OllamaDownload({ os: given, short }: { os?: DesktopOs | null; short?: boolean }) {
  // Read after hydration: the server can't know the visitor's computer.
  const detected = useSyncExternalStore(noSubscribe, desktopOs, () => null);
  const os = given === undefined ? detected : given;
  const pick = os ? OLLAMA_DOWNLOADS[os] : null;
  if (pick?.command) return <CopyLine text={pick.command} />;
  return (
    <a href={pick?.url ?? "https://ollama.com/download"} target="_blank" rel="noreferrer noopener" className={`${buttonClass("secondary", "md")} gap-2 justify-self-start`}>
      <DownloadSimple size={18} weight="bold" aria-hidden />
      {(short ? pick?.label.replace(" Ollama", "") : pick?.label) ?? (short ? "Download" : "Download Ollama")}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

type PullLine = { status?: string; digest?: string; total?: number; completed?: number; error?: string };

/** One-click model download through Ollama, with its progress. onDone runs once the model is in. */
/** primary: the one lime button in view; the optional bigger model gets a plain one. */
export function GemmaPull({ model, sizeLabel, onDone, primary = true }: { model: string; sizeLabel: string; onDone: () => void; primary?: boolean }) {
  const [state, setState] = useState<{ phase: "idle" | "pulling" | "error"; status?: string; done?: number; total?: number; message?: string }>({ phase: "idle" });
  const stop = useRef<AbortController | null>(null);
  useEffect(() => () => stop.current?.abort(), []);

  const start = async () => {
    const ctl = new AbortController();
    stop.current = ctl;
    setState({ phase: "pulling", status: "Starting" });
    try {
      const res = await fetch("/api/ollama", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model }), signal: ctl.signal });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(err?.message ?? "Couldn't start the download.");
      }
      // Ollama downloads the model in layers; the big one is the bar worth showing.
      const layers = new Map<string, { done: number; total: number }>();
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      let ok = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const raw of lines) {
          if (!raw.trim()) continue;
          const line = JSON.parse(raw) as PullLine;
          if (line.error) throw new Error(`Ollama: ${line.error}`);
          if (line.status === "success") ok = true;
          if (line.digest && line.total) layers.set(line.digest, { done: line.completed ?? 0, total: line.total });
          const total = [...layers.values()].reduce((n, l) => n + l.total, 0);
          const got = [...layers.values()].reduce((n, l) => n + l.done, 0);
          setState({ phase: "pulling", status: line.status, done: got, total });
        }
      }
      if (!ok) throw new Error("The download stopped before it finished. Try again: it carries on where it left off.");
      setState({ phase: "idle" });
      onDone();
    } catch (e) {
      if (ctl.signal.aborted) return setState({ phase: "idle" });
      setState({ phase: "error", message: e instanceof Error ? e.message : "The download didn't work. Try again." });
    }
  };

  if (state.phase === "pulling") {
    const pct = state.total ? Math.min(100, Math.round(((state.done ?? 0) / state.total) * 100)) : null;
    const gb = (n = 0) => (n / 1e9).toFixed(1);
    return (
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3 text-body">
          <span className="text-ink">Downloading {model}</span>
          <span className="font-mono text-caption text-ink-2">{pct === null ? state.status : `${gb(state.done)} of ${gb(state.total)} GB`}</span>
        </div>
        <div role="progressbar" aria-label={`Downloading ${model}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} className="h-2 overflow-hidden rounded-pill bg-sunken">
          <div className="h-full rounded-pill bg-ink transition-[width] duration-500" style={{ width: `${pct ?? 2}%` }} />
        </div>
        <p className="text-caption text-ink-3">You can keep using Deis. If it stops, start it again: Ollama carries on where it left off.</p>
        <div>
          <Button size="sm" variant="ghost" onClick={() => stop.current?.abort()}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div>
        <Button variant={primary ? "primary" : "secondary"} onClick={start} className="gap-2">
          <DownloadSimple size={18} weight="bold" aria-hidden />
          Download {model} ({sizeLabel})
        </Button>
      </div>
      {state.phase === "error" && (
        <p role="alert" className="text-body text-danger">
          {state.message}
        </p>
      )}
    </div>
  );
}

/** The three steps, for the web demo, where Gemma can't run on the visitor's computer. */
export function LocalSteps() {
  return (
    <ol className="grid list-decimal gap-3 pl-5 text-body text-ink-2 marker:font-mono marker:text-[12px] marker:text-ink-3">
      <li>
        <a href="/download" className="link font-medium">
          Download the Deis app
        </a>{" "}
        for Mac, Windows or Linux. It&apos;s free for 14 days.
      </li>
      <li>
        <div className="grid gap-2">
          <span>Install Ollama, the free app that runs Gemma. One download, then open it once.</span>
          <OllamaDownload />
        </div>
      </li>
      <li>In Deis, choose Download Gemma. It fetches the model for you (about 7 GB, once). No terminal needed.</li>
    </ol>
  );
}

const HIDE = "deis.localHint";

function readHidden(): boolean {
  try {
    return sessionStorage.getItem(HIDE) === "1";
  } catch {
    return false;
  }
}

/**
 * On the web demo, while the shared demo key answers: a line that says why it can be slow
 * and what to do instead. Hidden for this tab once dismissed.
 */
export function DemoModelBanner() {
  const { status, effectiveModel, route } = useStore();
  const stored = useSyncExternalStore(noSubscribe, readHidden, () => true);
  const [closed, setClosed] = useState(false);
  const hidden = stored || closed;
  // The model page says the same thing at more length.
  if (!status?.hosted || effectiveModel.tier !== "demo" || hidden || route?.name === "model" || route?.name === "settings") return null;
  const close = () => {
    setClosed(true);
    try {
      sessionStorage.setItem(HIDE, "1");
    } catch {
      // storage blocked: hidden for this page only
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-panel bg-accent-soft py-1.5 pr-1.5 pl-4 text-body text-ink">
      <Laptop size={18} aria-hidden className="shrink-0" />
      <p className="min-w-0 flex-1 py-1">
        <span className="font-semibold">For the best results, run Gemma on your own computer.</span> The demo&apos;s Gemma is shared by everyone trying Deis, so it hits its limit and slows down at busy times.
      </p>
      <a href={routeHref({ name: "model" })} className={`${buttonClass("ghost", "sm")} gap-1.5 text-ink underline underline-offset-2`}>
        Set it up
        <ArrowRight size={14} weight="bold" aria-hidden />
      </a>
      <button type="button" onClick={close} className="grid size-9 place-items-center rounded-pill text-ink-2 hover:bg-surface hover:text-ink">
        <X size={16} aria-hidden />
        <span className="sr-only">Hide this</span>
      </button>
    </div>
  );
}
