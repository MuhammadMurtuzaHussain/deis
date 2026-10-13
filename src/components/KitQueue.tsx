"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/client/api";
import { db, loadProfile } from "@/lib/client/db";
import { runFit, runKit, updateApplication } from "@/lib/client/kit";

// Quick lane: swipe right and keep swiping. Each kit (fit check, CV, letter, answers)
// is built in the background, one at a time, so a laptop's single Gemma isn't asked
// to do five things at once. The tracker shows what's ready.

type Queue = { working: string | null; since: number | null; waiting: number };
const Ctx = createContext<Queue>({ working: null, since: null, waiting: 0 });
export const useKitQueue = () => useContext(Ctx);

export function KitQueue({ children }: { children: ReactNode }) {
  const pending = useLiveQuery(() => db.applications.filter((a) => a.lane === "quick" && !a.kit && !a.kitError && a.status === "ready").sortBy("createdAt"), [], []);
  const [working, setWorking] = useState<{ id: string; since: number } | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (busy.current || !pending.length) return;
    const next = pending[0];
    busy.current = true;
    setWorking({ id: next.id, since: Date.now() });
    (async () => {
      try {
        const profile = await loadProfile();
        let fit = next.fit;
        if (!fit) {
          const out = await runFit(next.job, profile);
          fit = out.fit;
          await updateApplication(next.id, { fit, fitEvents: out.events });
        }
        const kit = await runKit(next.job, profile, fit);
        await updateApplication(next.id, { kit, kitError: null });
      } catch (e) {
        await updateApplication(next.id, { kitError: e instanceof ApiError ? e.message : "The kit couldn't be built. Try again." });
      } finally {
        busy.current = false;
        setWorking(null);
      }
    })();
  }, [pending]);

  return <Ctx.Provider value={{ working: working?.id ?? null, since: working?.since ?? null, waiting: pending.length }}>{children}</Ctx.Provider>;
}
