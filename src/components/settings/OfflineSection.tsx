"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { DEFAULTS } from "@/lib/ai/settings";
import { ApiError } from "@/lib/client/api";
import { db } from "@/lib/client/db";
import { savedOn } from "@/lib/client/offline";
import { routeHref, useStore, type Licence } from "@/lib/client/store";
import { Button, Notice, toast } from "../ui";
import { CheckItem, CopyLine, SettingsSection, SpringSwitch } from "./parts";
import { hasGemma, useOllama } from "./useOllama";

// Offline mode, for the desktop app and local runs (hidden on the hosted demo). With it on,
// the Deis server connects to nothing but this computer. The checklist says whether that
// will actually work: Ollama, a Gemma model, saved jobs to swipe and the licence.

function licenceLine(l: Licence | null): { ok: boolean; text: string } {
  if (!l || l.state === "off") return { ok: true, text: "No licence needed for this copy" };
  if (l.state === "licensed") return { ok: true, text: "Licensed. The key is checked again when you're back online." };
  if (l.state === "trial") return { ok: true, text: `Free trial, ${l.daysLeft} ${l.daysLeft === 1 ? "day" : "days"} left` };
  return { ok: false, text: "Trial ended: Deis is read-only until you enter a key, which needs the internet" };
}

export function OfflineSection() {
  const { offline, setOfflineMode, effectiveModel, feedSavedAt, licence } = useStore();
  const { info: ollama, checking, refresh } = useOllama();
  const jobs = useLiveQuery(() => db.jobs.count(), [], null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const forced = offline.mode === "forced";
  const on = offline.mode !== "off";
  const gemma = hasGemma(ollama);
  const lic = licenceLine(licence);
  // Turning it on needs a Gemma to answer; turning it off is always allowed (unless forced).
  const blocked = forced ? "Deis was started in offline mode. Restart it normally to go online." : !on && ollama && !gemma ? "Download a Gemma model first: offline, it's the only model Deis can use." : null;
  const saved = savedOn(feedSavedAt);

  const toggle = async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await setOfflineMode(next);
      toast(next ? "Offline mode is on. Deis connects to nothing but this computer." : "Offline mode is off.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection title="Offline" description="Work on a train or with Wi-Fi off. You keep your profile, saved jobs, pasted jobs, kits, Word and PDF. New jobs wait until you're back online.">
      <div className="grid gap-4 rounded-panel border border-line bg-surface p-4 sm:p-5">
        <SpringSwitch
          checked={on}
          onChange={toggle}
          disabled={busy || Boolean(blocked)}
          label="Work offline"
          description={blocked ?? (on ? "On. Deis connects to nothing but this computer." : "Deis connects only to this computer: Ollama and itself.")}
        />
        {error && <Notice tone="error">{error}</Notice>}
        {on && !effectiveModel.worksOffline && (
          <Notice tone="warn" announce={false}>
            Your AI model, {effectiveModel.label}, needs the internet. Choose Gemma on this computer under AI model.
          </Notice>
        )}
      </div>

      <div className="grid gap-3">
        <h3 className="text-body font-semibold text-ink">Ready to go offline?</h3>
        <ul className="grid gap-3 rounded-panel border border-line bg-surface p-4 sm:p-5" aria-busy={ollama === null || undefined}>
          <CheckItem ok={ollama ? ollama.running : null} detail={ollama && !ollama.running ? "Install it from ollama.com and open it." : undefined}>
            {ollama === null ? "Looking for Ollama" : ollama.running ? "Ollama is running" : "Ollama isn't running"}
          </CheckItem>
          <CheckItem
            ok={ollama ? gemma : null}
            detail={ollama?.running && !gemma ? <CopyLine text={`ollama pull ${DEFAULTS.ollama}`} /> : gemma ? ollama?.models.filter((m) => m.name.startsWith("gemma")).map((m) => m.name).join(", ") : undefined}
          >
            {gemma ? "A Gemma model is downloaded" : "No Gemma model downloaded yet"}
          </CheckItem>
          <CheckItem ok={jobs === null ? null : jobs > 0} detail={jobs ? "Swipe through these offline, or paste a job you found elsewhere." : "Open Jobs once while online to save some."}>
            {jobs === null ? "Counting saved jobs" : jobs > 0 ? `${jobs} ${jobs === 1 ? "job" : "jobs"} saved${saved ? ` on ${saved}` : ""}` : "No jobs saved yet"}
          </CheckItem>
          <CheckItem ok={lic.ok} detail={!lic.ok ? <a href={routeHref({ name: "licence" })} className="link">Buy or enter a key</a> : undefined}>
            {lic.text}
          </CheckItem>
        </ul>
        <div>
          <Button size="sm" busy={checking} onClick={refresh}>
            Check again
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
