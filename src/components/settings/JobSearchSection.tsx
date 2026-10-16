"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/client/api";
import { getMeta } from "@/lib/client/db";
import { checkSerpKey, loadSerpKey, PAUSED_META, saveSerpKey } from "@/lib/client/serpapi";
import { parseSerpKey, SERPAPI_SIGN_UP } from "@/lib/serpapi";
import { Button, Field, inputClass, Notice, toast } from "../ui";
import { SettingsSection } from "./parts";

// Google Jobs results come through SerpApi. The demo shares one key with a monthly budget;
// with their own free key a user's searches keep going when that runs out. The key stays on
// this device and goes only to serpapi.com, through the Deis server, with each feed request.

type Check = { state: "idle" } | { state: "checking" } | { state: "ok"; left: number | null } | { state: "error"; message: string };

const leftLine = (left: number | null) => (left === null ? "Your key works." : `Your key works: ${left.toLocaleString("en-IE")} ${left === 1 ? "search" : "searches"} left this month.`);

export function JobSearchSection() {
  const saved = useLiveQuery(loadSerpKey, [], undefined);
  const paused = useLiveQuery(() => getMeta<boolean>(PAUSED_META, false), [], false);
  const [draft, setDraft] = useState("");
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const [busy, setBusy] = useState(false);

  // A saved key is checked once when Settings opens, so the searches-left line is current.
  useEffect(() => {
    if (!saved) return;
    let live = true;
    checkSerpKey(saved)
      .then((r) => live && setCheck({ state: "ok", left: r.left }))
      .catch((e) => live && setCheck({ state: "error", message: e instanceof ApiError ? e.message : "Couldn't check the key." }));
    return () => {
      live = false;
    };
  }, [saved]);

  const save = async () => {
    const key = parseSerpKey(draft);
    if (!key) {
      setCheck({ state: "error", message: "That doesn't look like a SerpApi key. Copy the whole private API key from your SerpApi dashboard." });
      return;
    }
    setBusy(true);
    setCheck({ state: "checking" });
    try {
      const r = await checkSerpKey(key);
      await saveSerpKey(key);
      setDraft("");
      setCheck({ state: "ok", left: r.left });
      toast("Key saved. Google Jobs searches will use it from the next refresh.");
    } catch (e) {
      // A key SerpApi refused isn't saved; one that couldn't be checked (offline, SerpApi down) is.
      if (e instanceof ApiError && e.code !== "serpapi_key") {
        await saveSerpKey(key);
        setDraft("");
        toast("Key saved. Deis couldn't check it just now and will try it on the next refresh.");
      }
      setCheck({ state: "error", message: e instanceof ApiError ? e.message : "Couldn't check the key." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    await saveSerpKey(null);
    setCheck({ state: "idle" });
    toast("Key removed. Deis uses the shared searches again.");
  };

  return (
    <SettingsSection
      title="Job search"
      description="Google Jobs results come through SerpApi. The demo shares one key with a monthly limit; with your own free key, your searches keep going when it runs out. The key stays on this device and is sent only to SerpApi."
    >
      {paused && !saved && (
        <Notice tone="warn" announce={false}>
          Google Jobs results are paused: the shared searches for this month are used up. Employer boards still work. Add your own free key below to bring Google Jobs back.
        </Notice>
      )}
      <div className="grid gap-4 rounded-panel border border-line bg-surface p-4 sm:p-5">
        {saved ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-body font-medium text-ink">
                Your SerpApi key <span className="font-mono text-caption text-ink-3">…{saved.slice(-4)}</span>
              </p>
              <p className="mt-0.5 text-caption text-ink-2" aria-live="polite">
                {check.state === "checking" || check.state === "idle" ? "Checking your key" : check.state === "ok" ? leftLine(check.left) : ""}
              </p>
            </div>
            <Button size="sm" onClick={remove}>
              Remove
            </Button>
          </div>
        ) : (
          <>
            <Field label="Your SerpApi key" help="A free SerpApi account is enough: results are saved for about a week and shared, so Deis uses only a handful of searches.">
              {(id, d) => (
                <input
                  id={id}
                  aria-describedby={d}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && draft.trim() && void save()}
                  className={inputClass}
                  placeholder="Private API key"
                />
              )}
            </Field>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button size="sm" variant="primary" busy={busy} disabled={!draft.trim()} onClick={save}>
                Save
              </Button>
              <a href={SERPAPI_SIGN_UP} target="_blank" rel="noreferrer noopener" className="link text-body">
                Get a free key
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
            {check.state === "checking" && <p className="text-caption text-ink-2">Checking your key</p>}
          </>
        )}
        {check.state === "error" && <Notice tone="error">{check.message}</Notice>}
      </div>
    </SettingsSection>
  );
}
