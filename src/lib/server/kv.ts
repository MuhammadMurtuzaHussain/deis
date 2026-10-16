import { Redis } from "ioredis";
import { isLoopback, isOfflineMode, onOffline } from "./net";

// A small shared cache. On Render it is a Key Value instance (REDIS_URL), so
// the job feed and the demo rate limits survive restarts and are
// shared by every request. Without REDIS_URL (local dev) it is a Map in this
// process. Either way a failure is a cache miss, never an error.

type Entry = { until: number; value: string };
const memory = new Map<string, Entry>();
let redis: Redis | null | undefined;

/** A Key Value somewhere else is the internet: offline mode uses this process's own cache instead. */
const remote = () => Boolean(process.env.REDIS_URL && !isLoopback(process.env.REDIS_URL));

// The open connection would keep talking after offline mode is switched on, so it closes.
onOffline(() => {
  if (!redis || !remote()) return;
  redis.disconnect();
  redis = undefined;
});

function client(): Redis | null {
  if (isOfflineMode() && remote()) return null;
  if (redis !== undefined) return redis;
  const url = process.env.REDIS_URL;
  redis = url ? new Redis(url, { maxRetriesPerRequest: 1, commandTimeout: 1500, connectTimeout: 3000 }) : null;
  redis?.on("error", (e) => console.warn("[kv]", e.message));
  return redis;
}

export const kvBackend = () => (process.env.REDIS_URL ? "render-key-value" : "memory");

function remember(key: string, value: string, ttlSec: number) {
  if (memory.size > 500) memory.delete(memory.keys().next().value!);
  memory.set(key, { until: Date.now() + ttlSec * 1000, value });
}

function recall(key: string): string | null {
  const hit = memory.get(key);
  if (!hit) return null;
  if (Date.now() > hit.until) {
    memory.delete(key);
    return null;
  }
  return hit.value;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const r = client();
  let raw: string | null = null;
  try {
    raw = r ? await r.get(`deis:${key}`) : recall(key);
  } catch {
    raw = recall(key);
  }
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: unknown, ttlSec: number): Promise<void> {
  const raw = JSON.stringify(value);
  const r = client();
  try {
    if (r) await r.set(`deis:${key}`, raw, "EX", ttlSec);
    else remember(key, raw, ttlSec);
  } catch {
    remember(key, raw, ttlSec);
  }
}

/** Set only if the key is free (a lock). True when this caller got it. */
export async function kvSetNx(key: string, value: unknown, ttlSec: number): Promise<boolean> {
  const raw = JSON.stringify(value);
  const r = client();
  try {
    if (r) return (await r.set(`deis:${key}`, raw, "EX", ttlSec, "NX")) === "OK";
  } catch {
    // fall through to this process's own lock
  }
  if (recall(key) !== null) return false;
  remember(key, raw, ttlSec);
  return true;
}

/** Round trip to Key Value for /api/status: milliseconds, or null when it didn't answer. */
export async function kvPing(): Promise<number | null> {
  const r = client();
  if (!r) return 0;
  const t = Date.now();
  try {
    return (await r.ping()) === "PONG" ? Date.now() - t : null;
  } catch {
    return null;
  }
}

/** Count one hit in a fixed window and return the count so far. */
export async function kvHit(key: string, windowSec: number): Promise<number> {
  const r = client();
  try {
    if (r) {
      const n = await r.incr(`deis:${key}`);
      if (n === 1) await r.expire(`deis:${key}`, windowSec);
      return n;
    }
  } catch {
    // fall through to this process's own count
  }
  const n = Number(recall(key) ?? 0) + 1;
  const hit = memory.get(key);
  memory.set(key, { until: hit && Date.now() <= hit.until ? hit.until : Date.now() + windowSec * 1000, value: String(n) });
  return n;
}
