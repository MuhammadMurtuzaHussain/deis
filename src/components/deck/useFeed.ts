"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, isAbort } from "@/lib/client/api";
import { db, feedSavedAt, getMeta, saveJobs, setMeta, type SavedJob } from "@/lib/client/db";
import { PAUSED_META, pausedFrom, serpHeaders } from "@/lib/client/serpapi";
import type { ScoredJob } from "@/lib/jobs/types";
import { feedUpdate, pickJobs, shouldRefresh, type FeedAnswer, type FeedBatch } from "./logic";

// The deck's jobs, stale-while-revalidate over db.jobs (OFF-1, OFF-8). Saved jobs render at
// once; the server is asked in the background, and only when online. A failed or offline
// refresh keeps everything already saved. An offline first run with nothing saved reads the
// starter list (public/starter-jobs.json) if the build shipped one.

type Starter = { savedAt: string | number; source: string; jobs: ScoredJob[] };

export type Feed = {
  /** Jobs to rank, or null while the first read of IndexedDB is under way. */
  jobs: SavedJob[] | null;
  /** Every pasted job, for the top of the deck. */
  pasted: SavedJob[];
  /** Senior roles the server hid before the jobs arrived (PRD-9). */
  hiddenSenior: number;
  /** A refresh is under way. */
  refreshing: boolean;
  /** The last refresh failed; jobs (if any) are the saved ones. */
  error: ApiError | null;
  /** Shown jobs came from the starter list shipped with the app. */
  starter: boolean;
  refresh: () => void;
};

export function useFeed(categories: string[], offline: boolean): Feed {
  const key = categories.join(",");
  const rows = useLiveQuery(() => db.jobs.toArray(), [], null);
  const batch = useLiveQuery(() => getMeta<FeedBatch | null>("feedBatch", null), [], undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const running = useRef<AbortController | null>(null);

  const loadStarter = useCallback(async () => {
    try {
      const r = await fetch("/starter-jobs.json", { signal: AbortSignal.timeout(15_000) });
      if (!r.ok) return false;
      const s = (await r.json()) as Starter;
      if (!Array.isArray(s.jobs) || !s.jobs.length) return false;
      const at = typeof s.savedAt === "number" ? s.savedAt : Date.parse(s.savedAt) || Date.now();
      await saveJobs(s.jobs, at);
      // fetchedAt 0: the real feed is asked for as soon as there's a connection.
      await setMeta("feedBatch", { ids: s.jobs.map((j) => j.id), categories: "starter", hiddenSenior: 0, fetchedAt: 0 } satisfies FeedBatch);
      return true;
    } catch {
      return false;
    }
  }, []);

  const fetchFeed = useCallback(async () => {
    running.current?.abort();
    const ctl = new AbortController();
    running.current = ctl;
    setRefreshing(true);
    setError(null);
    try {
      const out = await api<FeedAnswer>("/api/feed", { categories, includeSenior: false }, { signal: ctl.signal, headers: await serpHeaders() });
      await setMeta(PAUSED_META, pausedFrom(out.sources?.searches));
      const decision = feedUpdate(await feedSavedAt(), out);
      if (decision.save) {
        await saveJobs(out.jobs, decision.at, { feed: decision.moveSavedAt });
        await setMeta("feedBatch", { ids: out.jobs.map((j) => j.id), categories: key, hiddenSenior: out.sources?.hiddenSenior ?? 0, fetchedAt: Date.now() } satisfies FeedBatch);
      }
    } catch (e) {
      if (isAbort(e)) return;
      const err = e instanceof ApiError ? e : new ApiError("Couldn't load jobs.", "network", 0);
      setError(err);
      // Nothing on this device and no way to get jobs: the starter list, if there is one.
      if ((err.kind === "offline" || err.kind === "network") && !(await db.jobs.count())) await loadStarter();
    } finally {
      if (running.current === ctl) {
        running.current = null;
        setRefreshing(false);
      }
    }
  }, [categories, key, loadStarter]);

  // Once the saved state is read: refresh in the background when online and due; offline with
  // nothing saved, try the starter list. Re-runs when the searches change or we come back online.
  useEffect(() => {
    if (rows === null || batch === undefined) return;
    // A tick later, so a quick run of changes (the roles saving one by one) asks once.
    const timer = setTimeout(() => {
      if (shouldRefresh(batch, key, { offline })) void fetchFeed();
      else if (offline && !rows.length) void loadStarter();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows === null, batch === undefined, key, offline]);

  useEffect(() => () => running.current?.abort(), []);

  const jobs = useMemo(() => (rows ? pickJobs(rows, batch?.ids ?? null) : null), [rows, batch]);
  const pasted = useMemo(() => (rows ?? []).filter((r) => r.source === "pasted"), [rows]);

  return {
    jobs,
    pasted,
    hiddenSenior: batch?.hiddenSenior ?? 0,
    refreshing,
    error,
    starter: batch?.categories === "starter",
    refresh: () => void fetchFeed(),
  };
}
