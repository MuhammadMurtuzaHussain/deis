"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, isPausable } from "@/lib/client/api";
import { db, loadProfile } from "@/lib/client/db";
import { runFit, runKit, updateApplication } from "@/lib/client/kit";
import { useStore } from "@/lib/client/store";

// Quick lane: swipe right and keep swiping. Each kit (fit check, CV, letter, answers)
// is built in the background, one at a time, so a laptop's single Gemma isn't asked
// to do five things at once. The tracker shows what's ready.
// - Offline or unreachable (OFF-5): the queue pauses instead of marking kits failed, and
//   carries on when the browser is back online or offline mode is switched off.
// - Two tabs (CH-9): a Web Lock means only one tab builds at a time, and each re-reads the
//   application inside the lock, so the same kit is never built twice.

export type QueuePause = { kind: "offline" | "network"; message: string };
type Queue = {
  /** The application being built, or null. */
  working: string | null;
  since: number | null;
  /** Kits waiting, the one being built included. */
  waiting: number;
  /** Why the queue is waiting for the network, or null. */
  paused: QueuePause | null;
};
const Ctx = createContext<Queue>({ working: null, since: null, waiting: 0, paused: null });
export const useKitQueue = () => useContext(Ctx);

/** A failed network kit is tried again after this long even if no "online" event comes (a server that was waking up). */
const NETWORK_RETRY_MS = 60_000;

/** Runs fn while holding the queue's lock, so another tab waits its turn. Where locks aren't supported, just runs it. */
function withQueueLock(fn: () => Promise<void>): Promise<void> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return locks ? locks.request("deis-kit-queue", () => fn()).then(() => undefined) : fn();
}

export function KitQueue({ children }: { children: ReactNode }) {
  const pending = useLiveQuery(() => db.applications.filter((a) => a.lane === "quick" && !a.kit && !a.kitError && a.status === "ready").sortBy("createdAt"), [], []);
  const [working, setWorking] = useState<{ id: string; since: number } | null>(null);
  const [failure, setFailure] = useState<QueuePause | null>(null);
  const busy = useRef(false);
  const { locked, isOffline, effectiveModel, offline } = useStore();

  // Offline with a model that needs the internet: wait without trying (a local Gemma carries on).
  const needsNet = isOffline && !effectiveModel.worksOffline;
  const blocked = useMemo<QueuePause | null>(() => (needsNet ? { kind: "offline", message: "You're offline. Kits wait until you're back online, or until you choose Gemma on this computer." } : null), [needsNet]);
  const paused = blocked ?? failure;

  // Resume after a pause: back online, offline mode switched off, or a minute later for a server that didn't answer.
  useEffect(() => {
    if (!failure) return;
    const resume = () => setFailure(null);
    window.addEventListener("online", resume);
    const timer = failure.kind === "network" ? setTimeout(resume, NETWORK_RETRY_MS) : undefined;
    return () => {
      window.removeEventListener("online", resume);
      clearTimeout(timer);
    };
  }, [failure]);
  const wasOn = useRef(offline.mode);
  useEffect(() => {
    if (wasOn.current !== "off" && offline.mode === "off") setFailure(null);
    wasOn.current = offline.mode;
  }, [offline.mode]);

  useEffect(() => {
    // A locked licence is read-only: no new kits until it's unlocked.
    if (busy.current || locked || paused || !pending.length) return;
    const next = pending[0];
    busy.current = true;
    setWorking({ id: next.id, since: Date.now() });
    void withQueueLock(async () => {
      // Another tab may have built (or failed) this one while we waited for the lock.
      const app = await db.applications.get(next.id);
      if (!app || app.kit || app.kitError || app.status !== "ready" || app.lane !== "quick") return;
      try {
        const profile = await loadProfile();
        let fit = app.fit;
        if (!fit) {
          const out = await runFit(app.job, profile);
          fit = out.fit;
          await updateApplication(app.id, { fit, fitEvents: out.events });
        }
        const kit = await runKit(app.job, profile, fit);
        await updateApplication(app.id, { kit, kitError: null });
      } catch (e) {
        // No network isn't the kit's fault: wait and try again rather than record a failure.
        if (isPausable(e)) setFailure({ kind: (e as ApiError).kind as QueuePause["kind"], message: (e as ApiError).message });
        else await updateApplication(app.id, { kitError: e instanceof ApiError ? e.message : "The kit couldn't be built. Try again." });
      }
    }).finally(() => {
      busy.current = false;
      setWorking(null);
    });
  }, [pending, locked, paused]);

  const value = useMemo<Queue>(() => ({ working: working?.id ?? null, since: working?.since ?? null, waiting: pending.length, paused }), [working, pending.length, paused]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
