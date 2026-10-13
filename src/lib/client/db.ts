"use client";

import Dexie, { type EntityTable } from "dexie";
import type { CardWhy } from "../ai/schema";
import type { Answers, Fit, Letter } from "../cv/schema";
import type { CvDocument } from "../cv/compose";
import type { GuardEvent } from "../cv/guard";
import type { ScoredJob } from "../jobs/types";
import { emptyPreferences, type Fact, type FactKind, type Header, type Preferences, type Profile } from "../profile/types";

// Everything Deis knows about you lives here, in your browser's (or the desktop
// app's) own database. There are no accounts and no server copy. Export makes a
// JSON backup; "Delete everything" in Settings clears it.

export type Swipe = { jobId: string; dir: "apply" | "skip" | "save"; reason?: string; at: number; /** Kept for saved jobs, so they can be found again. */ job?: ScoredJob };
export type CardCache = { jobId: string; why: CardWhy["why"]; score: number; at: number };

export const STATUSES = ["ready", "applied", "interview", "offer", "closed"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<Status, string> = { ready: "Ready to apply", applied: "Applied", interview: "Interview", offer: "Offer", closed: "Closed" };

export type Kit = {
  cv: CvDocument;
  letter: Letter | null;
  answers: Answers | null;
  events: GuardEvent[];
  usage: { inputTokens: number; outputTokens: number; ms: number };
  model: string;
  at: number;
};

export type Application = {
  id: string;
  job: ScoredJob;
  lane: "quick" | "careful";
  status: Status;
  fit: Fit | null;
  fitEvents: GuardEvent[];
  kit: Kit | null;
  /** Why the background build failed, shown with a Retry. */
  kitError?: string | null;
  notes: string;
  createdAt: number;
  updatedAt: number;
  appliedAt: number | null;
};

export type Proposal = { id: string; kind: FactKind; text: string; org: string | null; jobId: string; need: string; at: number };

type Meta = { key: string; value: unknown };
type FeedCache = { key: string; jobs: ScoredJob[]; at: number; sources: unknown };

class DeisDB extends Dexie {
  facts!: EntityTable<Fact, "id">;
  meta!: EntityTable<Meta, "key">;
  feed!: EntityTable<FeedCache, "key">;
  swipes!: EntityTable<Swipe, "jobId">;
  cards!: EntityTable<CardCache, "jobId">;
  applications!: EntityTable<Application, "id">;
  proposals!: EntityTable<Proposal, "id">;

  constructor() {
    super("deis");
    this.version(1).stores({
      facts: "id, kind, org, confirmed",
      meta: "key",
      feed: "key",
      swipes: "jobId, dir, at",
      cards: "jobId",
      applications: "id, status, updatedAt",
      proposals: "id, jobId",
    });
  }
}

export const db = new DeisDB();

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  return ((await db.meta.get(key))?.value as T | undefined) ?? fallback;
}
export const setMeta = (key: string, value: unknown) => db.meta.put({ key, value });

export const emptyHeader = (): Header => ({ name: "", email: null, phone: null, location: null, links: [] });

export async function loadProfile(): Promise<Profile> {
  const [facts, header, neverClaim, preferences] = await Promise.all([
    db.facts.toArray(),
    getMeta<Header>("header", emptyHeader()),
    getMeta<string[]>("neverClaim", []),
    getMeta<Preferences>("preferences", emptyPreferences()),
  ]);
  return { facts: facts.sort((a, b) => a.createdAt.localeCompare(b.createdAt)), header, neverClaim, preferences };
}

export async function saveProfile(p: Profile) {
  await db.transaction("rw", db.facts, db.meta, async () => {
    await db.facts.clear();
    await db.facts.bulkPut(p.facts);
    await setMeta("header", p.header);
    await setMeta("neverClaim", p.neverClaim);
    await setMeta("preferences", p.preferences);
  });
}

export async function exportAll() {
  return {
    app: "deis",
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: await loadProfile(),
    applications: await db.applications.toArray(),
    swipes: await db.swipes.toArray(),
    proposals: await db.proposals.toArray(),
  };
}

export async function importAll(json: Awaited<ReturnType<typeof exportAll>>) {
  if (json?.app !== "deis") throw new Error("That file isn't a Deis backup.");
  await saveProfile(json.profile);
  await db.transaction("rw", db.applications, db.swipes, db.proposals, async () => {
    await db.applications.bulkPut(json.applications ?? []);
    await db.swipes.bulkPut(json.swipes ?? []);
    await db.proposals.bulkPut(json.proposals ?? []);
  });
}

export async function deleteEverything() {
  await db.delete();
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("deis.")) localStorage.removeItem(k);
  } catch {
    // storage blocked: nothing to clear
  }
}
