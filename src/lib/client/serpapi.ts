"use client";

import { parseSerpKey, SERPAPI_HEADER } from "../serpapi";
import { api } from "./api";
import { getMeta, setMeta } from "./db";

// The user's own SerpApi key, kept in this browser (or the desktop app) with the other
// settings, and sent only with feed requests and the key check. The server never stores it.

const META = "serpapiKey";

export const loadSerpKey = async (): Promise<string | null> => parseSerpKey(await getMeta<string | null>(META, null));

export async function saveSerpKey(key: string | null) {
  await setMeta(META, key ? parseSerpKey(key) : null);
}

/** Headers for a feed request: the key when there is one. */
export async function serpHeaders(): Promise<Record<string, string> | undefined> {
  const key = await loadSerpKey();
  return key ? { [SERPAPI_HEADER]: key } : undefined;
}

/** Searches left on a key; throws ApiError (code "serpapi_key") when SerpApi refuses it. */
export async function checkSerpKey(key: string): Promise<{ left: number | null }> {
  return api<{ left: number | null }>("/api/serpapi", undefined, { headers: { [SERPAPI_HEADER]: key.trim() } });
}

/** Whether the last feed had Google Jobs searches that couldn't run because the shared budget was spent. */
export const PAUSED_META = "googleJobsPaused";

export function pausedFrom(searches: Record<string, string> | undefined): boolean {
  return Object.values(searches ?? {}).some((v) => v === "budget");
}
