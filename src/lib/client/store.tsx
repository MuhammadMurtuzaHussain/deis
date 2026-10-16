"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { AiSettings } from "../ai/settings";
import { emptyPreferences, type Fact, type Header, type Preferences, type Profile } from "../profile/types";
import { loadAiSettings, saveAiSettings } from "./api";
import { db, emptyHeader, setMeta } from "./db";

// App state: the route (in the URL hash, so Back works in the desktop app too), the
// profile (live from IndexedDB), the model choice, and what the server can do.

export type Route = { name: "welcome" | "checkin" | "model" | "profile" | "deck" | "tracker" | "settings" } | { name: "application"; id: string };

function parseHash(hash: string): Route | null {
  const h = hash.replace(/^#\/?/, "");
  if (!h) return null;
  const [name, id] = h.split("/");
  if (name === "application" && id) return { name, id: decodeURIComponent(id) };
  if (["welcome", "checkin", "model", "profile", "deck", "tracker", "settings"].includes(name)) return { name } as Route;
  return null;
}

export const routeHref = (r: Route) => (r.name === "application" ? `#/application/${encodeURIComponent(r.id)}` : `#/${r.name}`);

export type Licence = ({ state: "off" } | { state: "trial"; daysLeft: number } | { state: "licensed"; customer: string | null } | { state: "locked" }) & { buyUrl?: string };

export type ServerStatus = { hosted: boolean; desktop: boolean; demoModel: boolean; offline?: { mode: "off" | "on" | "forced"; reachable?: boolean }; services: { jobSearch: boolean; tracing: boolean; cache: string } };

type Store = {
  route: Route | null;
  go: (r: Route) => void;
  profile: Profile | null;
  setHeader: (h: Header) => Promise<void>;
  setPreferences: (p: Preferences) => Promise<void>;
  setNeverClaim: (n: string[]) => Promise<void>;
  putFacts: (f: Fact[]) => Promise<void>;
  removeFact: (id: string) => Promise<void>;
  ai: AiSettings | null;
  setAi: (s: AiSettings) => void;
  status: ServerStatus | null;
  licence: Licence | null;
  setLicence: (l: Licence) => void;
  /** Which demo persona is loaded, if any (src/lib/client/demo.ts). */
  demo: string | null;
};

const Ctx = createContext<Store | null>(null);

const onHashChange = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

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

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s: ServerStatus) => {
        setStatus(s);
        if (s.desktop)
          fetch("/api/licence")
            .then((r) => r.json())
            .then(setLicence)
            .catch(() => setLicence(null));
      })
      .catch(() => setStatus(null));
  }, []);

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

  const demo = (meta?.find((m) => m.key === "demo")?.value as { persona: string } | undefined)?.persona ?? null;

  const value: Store = {
    route,
    go,
    profile,
    setHeader: async (h) => void (await setMeta("header", h)),
    setPreferences: async (p) => void (await setMeta("preferences", p)),
    setNeverClaim: async (n) => void (await setMeta("neverClaim", n)),
    putFacts: async (f) => void (await db.facts.bulkPut(f)),
    removeFact: async (id) => void (await db.facts.delete(id)),
    ai,
    setAi: (s) => {
      saveAiSettings(s);
      setAiState(s);
    },
    status,
    licence,
    setLicence,
    demo,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

/** Has the user done enough to see the deck? */
export const isOnboarded = (p: Profile | null) => Boolean(p && p.preferences.stage && p.preferences.roles.length);
