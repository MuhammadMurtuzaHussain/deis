"use client";

import { AI_HEADER, aiSettingsSchema, encodeSettings, type AiSettings } from "../ai/settings";

// The user's model choice lives in this browser (or the desktop app) and rides along
// with each AI request in one header. The hosted demo never stores it.

const KEY = "deis.ai";

export function loadAiSettings(): AiSettings | null {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? aiSettingsSchema.safeParse(JSON.parse(raw)) : null;
    return parsed?.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveAiSettings(s: AiSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage blocked: the choice lasts this session only
  }
  current = s;
}

let current: AiSettings | null = null;
const settings = () => current ?? loadAiSettings() ?? { provider: "demo" as const };

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, body?: unknown, opts: { signal?: AbortSignal; ai?: AiSettings } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", [AI_HEADER]: encodeSettings(opts.ai ?? settings()) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("Couldn't reach Deis's server. If you're on the web demo, it may be waking up: try again in a minute.", "network", 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.message ?? `Something went wrong (${res.status}).`, data?.error ?? "error", res.status);
  return data as T;
}
