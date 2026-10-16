"use client";

import { useState } from "react";
import { ApiError } from "@/lib/client/api";
import { loadProfile, type Application } from "@/lib/client/db";
import { runFit, runKit, updateApplication } from "@/lib/client/kit";
import { toast } from "../ui";
import { mergeRewrite, withFitEvents } from "./trace";

// "Write it again" in the Quick lane. The kit on screen stays until the new one is saved,
// so a failed rewrite loses nothing; a part the rewrite fails on keeps its old version.
// recheck: a kit from older guard rules also gets its fit checked again, so its Checks
// tab stops listing removals today's rules wouldn't make.

export function useRewrite(app: Application | null | undefined) {
  const [busy, setBusy] = useState<{ since: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (recheck: boolean) => {
    if (!app?.fit || busy) return;
    setBusy({ since: Date.now() });
    setError(null);
    try {
      const profile = await loadProfile();
      const fresh = recheck ? await runFit(app.job, profile) : null;
      let next = await runKit(app.job, profile, fresh?.fit ?? app.fit);
      if (fresh) next = withFitEvents(next, app.fitEvents, fresh.events);
      if (app.kit) next = mergeRewrite(app.kit, next);
      await updateApplication(app.id, { ...(fresh ? { fit: fresh.fit, fitEvents: fresh.events } : {}), kit: next, kitError: null });
      toast("Your kit was written again.");
    } catch (e) {
      setError(e instanceof ApiError ? `${e.message} This kit is unchanged.` : "The kit couldn't be written again. This one is unchanged.");
    } finally {
      setBusy(null);
    }
  };

  return { busy, error, run };
}
