"use client";

import type { Fit } from "../cv/schema";
import type { GuardEvent } from "../cv/guard";
import type { ScoredJob } from "../jobs/types";
import type { Profile } from "../profile/types";
import { api } from "./api";
import { db, getMeta, type Application, type Kit } from "./db";

// The two AI steps after a swipe right, shared by the background queue (Quick lane)
// and the application screen (Careful lane).

export type KitParts = { letter: boolean; answers: boolean };
export const kitParts = () => getMeta<KitParts>("kitParts", { letter: true, answers: true });

const usable = (p: Profile) => ({ header: p.header, facts: p.facts.filter((f) => f.confirmed), neverClaim: p.neverClaim });

export async function runFit(job: ScoredJob, p: Profile): Promise<{ fit: Fit; events: GuardEvent[] }> {
  const { facts, neverClaim } = usable(p);
  return api("/api/fit", { job, facts, neverClaim });
}

/** Both callers save the fit (and its guard events) first, so the lane and those events are read back here. */
export async function runKit(job: ScoredJob, p: Profile, fit: Fit): Promise<Kit> {
  const [include, app] = await Promise.all([kitParts(), db.applications.get(job.id)]);
  const out = await api<Omit<Kit, "at">>("/api/kit", { job, profile: usable(p), fit, include, lane: app?.lane ?? "quick" });
  // The Checks tab lists everything the guard stepped in on, the fit check included.
  return { ...out, events: [...(app?.fitEvents ?? []), ...out.events], at: Date.now() };
}

export function newApplication(job: ScoredJob, lane: Application["lane"]): Application {
  const now = Date.now();
  return { id: job.id, job, lane, status: "ready", fit: null, fitEvents: [], kit: null, kitError: null, notes: "", createdAt: now, updatedAt: now, appliedAt: null };
}

export const updateApplication = (id: string, patch: Partial<Application>) => db.applications.update(id, { ...patch, updatedAt: Date.now() });
