"use client";

import Dexie, { type EntityTable } from "dexie";
import type { CardWhy } from "../ai/schema";
import type { Answers, Fit, Letter } from "../cv/schema";
import type { CvDocument } from "../cv/compose";
import type { GuardEvent, GuardRepair } from "../cv/guard";
import type { ScoredJob } from "../jobs/types";
import { emptyPreferences, type Fact, type FactKind, type Header, type Preferences, type Profile } from "../profile/types";

// Everything Deis knows about you lives here, in your browser's (or the desktop
// app's) own database. There are no accounts and no server copy. Export makes a
// JSON backup; "Delete everything" in Settings clears it.

export type Swipe = { jobId: string; dir: "apply" | "skip" | "save"; reason?: string; at: number; /** Kept for saved jobs, so they can be found again. */ job?: ScoredJob };
/** Gemma's "why" lines for a card. factsKey: which facts they were written from (see factsKey()); a mismatch is a miss. */
export type CardCache = { jobId: string; why: CardWhy["why"]; score: number; at: number; factsKey?: string };
/** Every job ever fetched or pasted, so the deck works offline and across role changes. savedAt: epoch ms. */
export type SavedJob = ScoredJob & { savedAt: number };

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
  /** Optional: kits saved before 16 Oct 2026 have none of these. */
  repairs?: GuardRepair[];
  /** A part that failed (letter, answers) while the rest was written. */
  errors?: string[];
  /** Which guard rules checked this kit (GUARD_VERSION). */
  guardVersion?: number;
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
  jobs!: EntityTable<SavedJob, "id">;

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
    // v2 (16 Oct 2026): a jobs table, filled from the old per-search feed cache so nothing is lost.
    this.version(2)
      .stores({ jobs: "id, savedAt, source" })
      .upgrade(async (tx) => {
        const feeds = (await tx.table("feed").toArray()) as FeedCache[];
        const rows = new Map<string, SavedJob>();
        for (const f of feeds) for (const j of f.jobs ?? []) if ((rows.get(j.id)?.savedAt ?? -1) < f.at) rows.set(j.id, { ...j, savedAt: f.at });
        if (rows.size) await tx.table("jobs").bulkPut([...rows.values()]);
        const newest = Math.max(0, ...feeds.map((f) => f.at ?? 0));
        if (newest) await tx.table("meta").put({ key: "feedSavedAt", value: newest });
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

// ---- Saved jobs (Dexie v2). The deck reads these first and refreshes in the background.

const toMs = (at: number | string | Date) => (typeof at === "number" ? at : new Date(at).getTime());

/**
 * Keep jobs on this device. A feed refresh (the default) also moves "feedSavedAt", which the
 * deck and the offline banner show as "Jobs saved on Thu 15 Oct". Pasted jobs pass {feed: false}.
 */
export async function saveJobs(jobs: ScoredJob[], savedAt: number | string | Date = Date.now(), opts: { feed?: boolean } = {}) {
  const at = Number.isFinite(toMs(savedAt)) ? toMs(savedAt) : Date.now();
  await db.transaction("rw", db.jobs, db.meta, async () => {
    if (jobs.length) await db.jobs.bulkPut(jobs.map((j) => ({ ...j, savedAt: at })));
    if (opts.feed !== false) await setMeta("feedSavedAt", at);
  });
}

/** Every saved job, newest first. Pass a source ("pasted") to narrow it. */
export async function savedJobs(opts: { source?: ScoredJob["source"] } = {}): Promise<SavedJob[]> {
  const rows = opts.source ? await db.jobs.where("source").equals(opts.source).toArray() : await db.jobs.toArray();
  return rows.sort((a, b) => b.savedAt - a.savedAt);
}

/** When the feed was last saved (epoch ms), or null if never. */
export const feedSavedAt = () => getMeta<number | null>("feedSavedAt", null);

/** A saved job without its savedAt, for code that wants a plain ScoredJob. */
export function asScoredJob(row: SavedJob): ScoredJob {
  const job: Partial<SavedJob> = { ...row };
  delete job.savedAt;
  return job as ScoredJob;
}

/**
 * Drop saved jobs older than maxAgeDays that nothing points at: not an application, not a
 * saved swipe, and not pasted by the user (those were typed by hand). Returns how many went.
 */
export async function pruneJobs(maxAgeDays = 30, now = Date.now()): Promise<number> {
  const cutoff = now - maxAgeDays * 86_400_000;
  return db.transaction("rw", db.jobs, db.applications, db.swipes, async () => {
    const old = await db.jobs.where("savedAt").below(cutoff).toArray();
    if (!old.length) return 0;
    const keep = new Set([...(await db.applications.toCollection().primaryKeys()), ...(await db.swipes.where("dir").equals("save").primaryKeys())]);
    const drop = old.filter((j) => j.source !== "pasted" && !keep.has(j.id)).map((j) => j.id);
    await db.jobs.bulkDelete(drop);
    return drop.length;
  });
}

// ---- Gemma's "why" lines, keyed to the facts they were written from (CH-X1).

/** A short hash of the confirmed facts: when it changes (new facts, a demo persona), cached lines are a miss. */
export function factsKey(facts: Pick<Fact, "id" | "text" | "confirmed">[]): string {
  const src = facts
    .filter((f) => f.confirmed)
    .map((f) => `${f.id}\u0000${f.text}`)
    .sort()
    .join("\u0001");
  // FNV-1a, 32 bit: not for security, just a cheap change detector.
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** The cached card for a job, or null when there is none or it was written from other facts. */
export async function getCard(jobId: string, key: string): Promise<CardCache | null> {
  const row = await db.cards.get(jobId);
  return row && row.factsKey === key ? row : null;
}

export const putCard = (row: CardCache & { factsKey: string }) => db.cards.put(row);

// ---- Storage that lasts. Browsers may evict IndexedDB under pressure unless asked not to.

/** Ask once for persistent storage (OFF-11). Quietly does nothing where unsupported. */
export async function requestPersistence() {
  try {
    if (await getMeta("persistAsked", false)) return;
    await setMeta("persistAsked", true);
    if (typeof navigator !== "undefined" && navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // no storage manager (older browsers, some private modes): nothing to ask
  }
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
    // Only the jobs typed in by hand: fetched ones come back with the next refresh.
    jobs: await db.jobs.where("source").equals("pasted").toArray(),
  };
}

export async function importAll(json: Awaited<ReturnType<typeof exportAll>>) {
  if (json?.app !== "deis") throw new Error("That file isn't a Deis backup.");
  await saveProfile(json.profile);
  await db.transaction("rw", [db.applications, db.swipes, db.proposals, db.jobs], async () => {
    await db.applications.bulkPut(json.applications ?? []);
    await db.swipes.bulkPut(json.swipes ?? []);
    await db.proposals.bulkPut(json.proposals ?? []);
    await db.jobs.bulkPut(json.jobs ?? []);
  });
}

/** Settings > Delete everything: the whole database (cards, jobs and all) and Deis's local storage. */
export async function deleteEverything() {
  await db.delete();
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("deis.")) localStorage.removeItem(k);
  } catch {
    // storage blocked: nothing to clear
  }
}
