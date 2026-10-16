"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULTS } from "@/lib/ai/settings";

// What GET /api/ollama says about this computer: is Ollama running, which models it has,
// and how much memory (for the "Better writing" default). Shared by the model chooser and
// the Offline section, so one look serves both; refresh() asks again.

export type OllamaInfo = { running: boolean; models: { name: string; gb: number }[]; hosted?: boolean; memoryGb?: number };

let cached: Promise<OllamaInfo> | null = null;

function load(fresh = false): Promise<OllamaInfo> {
  if (!cached || fresh)
    cached = fetch("/api/ollama", { signal: AbortSignal.timeout(10_000) })
      .then((r) => r.json() as Promise<OllamaInfo>)
      .catch(() => ({ running: false, models: [] }));
  return cached;
}

/** null until the first answer. skip: the hosted demo never probes local addresses. */
export function useOllama(skip = false) {
  const [info, setInfo] = useState<OllamaInfo | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (skip) return;
    let live = true;
    void load().then((d) => live && setInfo(d));
    return () => {
      live = false;
    };
  }, [skip]);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      setInfo(await load(true));
    } finally {
      setChecking(false);
    }
  }, []);

  return { info, checking, refresh };
}

/** Any Gemma model Ollama has downloaded. */
export const hasGemma = (o: OllamaInfo | null) => Boolean(o?.models.some((m) => m.name.startsWith("gemma")));

/** "Better writing" is on by default with 24 GB or more and the 12B model already downloaded (OQ-16). */
export const betterWritingDefault = (o: OllamaInfo) => (o.memoryGb ?? 0) >= 24 && o.models.some((m) => m.name === DEFAULTS.kitModel);
