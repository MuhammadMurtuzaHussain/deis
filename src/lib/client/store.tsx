"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { AiSettings } from "../ai/settings";
import { emptyPreferences, type Fact, type Header, type Preferences, type Profile } from "../profile/types";
import { api, loadAiSettings, saveAiSettings } from "./api";
import { db, emptyHeader, pruneJobs, requestPersistence, setMeta } from "./db";
import { effectiveModel, type EffectiveModel, type ServerStatus } from "./model";
import { initialOffline, isOffline, type OfflineMode, type OfflineState } from "./offline";

// App state: the route (in the URL hash, so Back works in the desktop app too), the
// profile (live from IndexedDB), the model choice, what the server can do, and whether
// we're offline. Documented in docs/DESIGN.md ("Contracts").

export type { ServerStatus } from "./model";

export type Route =
  /** licence: the read-only lock's "Buy or enter a key" page (Licence.tsx). */
  | { name: "welcome" | "checkin" | "model" | "profile" | "deck" | "tracker" | "settings" | "licence" }
  | { name: "application"; id: string }
  /** #/demo/aoife, #/demo/rahul: load that persona and go to the deck (PRD-15). */
  | { name: "demo"; persona: string };

const SIMPLE = ["welcome", "checkin", "model", "profile", "deck", "tracker", "settings", "licence"];

export function parseHash(hash: string): Route | null {
  const h = hash.replace(/^#\/?/, "");
  if (!h) return null;
  const [name, id] = h.split("/");
  if (name === "application" && id) return { name, id: decodeURIComponent(id) };
  if (name === "demo" && id) return { name, persona: decodeURIComponent(id) };
  if (SIMPLE.includes(name)) return { name } as Route;
  return null;
}

export const routeHref = (r: Route) => (r.name === "application" ? `#/application/${encodeURIComponent(r.id)}` : r.name === "demo" ? `#/demo/${encodeURIComponent(r.persona)}` : `#/${r.name}`);

export type Licence = ({ state: "off" } | { state: "trial"; daysLeft: number } | { state: "licensed"; customer: string | null } | { state: "locked" }) & { buyUrl?: string };

type Store = {
  route: Route | null;
  go: (r: Route) => void;
  profile: Profile | null;
  setHeader: (h: Header) => Promise<void>;
  setPreferences: (p: Preferences) => Promise<void>;
  setNeverClaim: (n: string[]) => Promise<void>;
  putFacts: (f: Fact[]) => Promise<void>;
  removeFact: (id: string) => Promise<void>;
  /** The saved model choice, or null when none was saved (requests then go as provider "demo"). */
  ai: AiSettings | null;
  setAi: (s: AiSettings) => void;
  /** What the model really is and how to describe it (src/lib/client/model.ts). */
  effectiveModel: EffectiveModel;
  status: ServerStatus | null;
  /** Fetch /api/status again now (after a failed feed, say). */
  refreshStatus: () => Promise<void>;
  /** Browser network, the server's offline switch and its last reachability (src/lib/client/offline.ts). */
  offline: OfflineState;
  /** offline mode is on or the browser has no network: new jobs and cloud models are out of reach. */
  isOffline: boolean;
  /** POST /api/offline. Throws ApiError ("forced", "not_here") when the server refuses. */
  setOfflineMode: (on: boolean) => Promise<OfflineMode>;
  /** When the deck's jobs were last saved (epoch ms), live from IndexedDB. */
  feedSavedAt: number | null;
  licence: Licence | null;
  setLicence: (l: Licence) => void;
  /** The licence is locked: read-only. No new kits; applications, profile, export and settings stay open. */
  locked: boolean;
  /** Which demo persona is loaded, if any (src/lib/client/demo.ts). */
  demo: string | null;
};

const Ctx = createContext<Store | null>(null);

const onHashChange = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

/** Focus refreshes /api/status at most this often; online/offline events refresh straight away. */
const STATUS_EVERY_MS = 60_000;

/** GET /api/status, or null when it fails (keep what we had: a failed check isn't news on its own). Plain fetch: no model header. */
async function loadStatus(last: { current: number }): Promise<ServerStatus | null> {
  last.current = Date.now();
  try {
    const r = await fetch("/api/status", { signal: AbortSignal.timeout(10_000) });
    return r.ok ? ((await r.json()) as ServerStatus) : null;
  } catch {
    return null;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const hash = useSyncExternalStore(
    onHashChange,
    () => location.hash,
    () => "",
  );
  const route = useMemo(() => parseHash(hash), [hash]);
  // The app shows a splash until IndexedDB answers, so reading storage here can't cause a hydration mismatch.
  const [ai, setAiState] = useState<AiSettings | null>(() => (typeof window === "undefined" ? null : loadAiSettings()));
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [licence, setLicence] = useState<Licence | null>(null);
  const [browserOnline, setBrowserOnline] = useState(() => initialOffline().browserOnline);
  const lastStatus = useRef(0);

  const refreshStatus = useCallback(async () => {
    const s = await loadStatus(lastStatus);
    if (s) setStatus(s);
  }, []);

  // Status once at start, the licence once on the desktop.
  useEffect(() => {
    loadStatus(lastStatus).then((s) => s && setStatus(s));
  }, []);
  const desktop = Boolean(status?.desktop);
  useEffect(() => {
    if (!desktop) return;
    fetch("/api/licence")
      .then((r) => r.json())
      .then(setLicence)
      .catch(() => setLicence(null));
  }, [desktop]);

  // Network: the browser's events, plus a status refresh when they fire or the window regains focus.
  useEffect(() => {
    const onOnline = () => {
      setBrowserOnline(true);
      void refreshStatus();
    };
    const onOffline = () => setBrowserOnline(false);
    const onFocus = () => {
      if (Date.now() - lastStatus.current >= STATUS_EVERY_MS) void refreshStatus();
    };
    const onVisible = () => document.visibilityState === "visible" && onFocus();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshStatus]);

  // Once per session: ask for storage that isn't evicted, and drop month-old jobs nothing uses.
  useEffect(() => {
    void requestPersistence();
    const t = setTimeout(() => void pruneJobs().catch(() => undefined), 10_000);
    return () => clearTimeout(t);
  }, []);

  const setOfflineMode = useCallback(
    async (on: boolean) => {
      const r = await api<{ mode: OfflineMode }>("/api/offline", { on });
      await refreshStatus();
      return r.mode;
    },
    [refreshStatus],
  );

  const facts = useLiveQuery(() => db.facts.toArray(), []);
  const meta = useLiveQuery(() => db.meta.toArray(), []);

  const profile = useMemo<Profile | null>(() => {
    if (!facts || !meta) return null;
    const get = <T,>(k: string, d: T) => (meta.find((m) => m.key === k)?.value as T | undefined) ?? d;
    return {
      facts: [...facts].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      header: get<Header>("header", emptyHeader()),
      neverClaim: get<string[]>("neverClaim", []),
      preferences: { ...emptyPreferences(), ...get<Partial<Preferences>>("preferences", {}) },
    };
  }, [facts, meta]);

  const go = useCallback((r: Route) => {
    const href = routeHref(r);
    if (location.hash !== href) location.hash = href;
    window.scrollTo({ top: 0 });
  }, []);

  const setAi = useCallback((s: AiSettings) => {
    saveAiSettings(s);
    setAiState(s);
  }, []);

  const demo = (meta?.find((m) => m.key === "demo")?.value as { persona: string } | undefined)?.persona ?? null;
  const feedSavedAt = (meta?.find((m) => m.key === "feedSavedAt")?.value as number | undefined) ?? null;

  const offline = useMemo<OfflineState>(
    () => ({ browserOnline, mode: status?.offline?.mode ?? "off", reachable: status?.offline?.reachable }),
    [browserOnline, status?.offline?.mode, status?.offline?.reachable],
  );
  const effective = useMemo(() => effectiveModel(ai, status), [ai, status]);
  const locked = licence?.state === "locked";

  // Memoised so screens that read the store don't re-render on every parent render (CH-18).
  const value = useMemo<Store>(
    () => ({
      route,
      go,
      profile,
      setHeader: async (h) => void (await setMeta("header", h)),
      setPreferences: async (p) => void (await setMeta("preferences", p)),
      setNeverClaim: async (n) => void (await setMeta("neverClaim", n)),
      putFacts: async (f) => void (await db.facts.bulkPut(f)),
      removeFact: async (id) => void (await db.facts.delete(id)),
      ai,
      setAi,
      effectiveModel: effective,
      status,
      refreshStatus,
      offline,
      isOffline: isOffline(offline),
      setOfflineMode,
      feedSavedAt,
      licence,
      setLicence,
      locked,
      demo,
    }),
    [route, go, profile, ai, setAi, effective, status, refreshStatus, offline, setOfflineMode, feedSavedAt, licence, locked, demo],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

/** Has the user done enough to see the deck? */
export const isOnboarded = (p: Profile | null) => Boolean(p && p.preferences.stage && p.preferences.roles.length);
