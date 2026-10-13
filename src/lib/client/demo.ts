"use client";

import { PERSONAS, type PersonaId } from "../demo/personas";
import type { Profile } from "../profile/types";
import { db, getMeta, loadProfile, saveProfile, setMeta } from "./db";

// The guided demo loads a fictional graduate's profile so anyone can try Deis in a
// minute. Whatever the user had is set aside first and put back on exit, and
// anything made during the demo (swipes, applications) is cleared.

type DemoState = { persona: PersonaId; startedAt: number; before: Profile };

export async function enterDemo(persona: PersonaId) {
  const current = await getMeta<DemoState | null>("demo", null);
  const before = current?.before ?? (await loadProfile());
  const p = PERSONAS[persona];
  await saveProfile({ ...p, facts: p.facts.map((f) => ({ ...f })) });
  await setMeta("demo", { persona, startedAt: current?.startedAt ?? Date.now(), before } satisfies DemoState);
}

export async function exitDemo() {
  const state = await getMeta<DemoState | null>("demo", null);
  if (!state) return;
  await saveProfile(state.before);
  await db.transaction("rw", db.swipes, db.applications, db.proposals, db.meta, async () => {
    await db.swipes.where("at").aboveOrEqual(state.startedAt).delete();
    await db.applications.filter((a) => a.createdAt >= state.startedAt).delete();
    await db.proposals.filter((p) => p.at >= state.startedAt).delete();
    await db.meta.delete("demo");
  });
}
