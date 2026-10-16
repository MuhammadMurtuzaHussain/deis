"use client";

import { AI_HEADER, aiSettingsSchema, encodeSettings, tierOf, type AiSettings, type Tier } from "../ai/settings";
import { KIT_STREAM } from "../kit-progress";

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

/**
 * What kind of failure, so a screen can react without parsing messages:
 * - offline      offline mode is on, or this device has no network (wait for "online")
 * - network      the server, or the AI host behind it, couldn't be reached (retry later)
 * - timeout      the call ran past its deadline (Gemma on a slow laptop, a stuck host)
 * - rate_limited the demo's hourly or daily limit
 * - model        the model answered badly, refused the key, or isn't installed
 * - bad_request  the request itself was refused (bad input, wrong origin)
 */
export type ApiErrorKind = "offline" | "network" | "timeout" | "rate_limited" | "model" | "bad_request";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  constructor(
    message: string,
    /** The server's error code ("offline", "model_quota", …), or "network" / "timeout" from the client. */
    public code: string,
    public status: number,
    kind?: ApiErrorKind,
    /** Seconds, from a 429's retry-after. */
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = kind ?? kindOf(code, status);
  }
}

/** Map a server error code and HTTP status to a kind. Exported for tests. */
export function kindOf(code: string, status: number): ApiErrorKind {
  switch (code) {
    case "offline":
      return "offline";
    case "network":
    case "feed_unreachable":
      return "network";
    case "model_timeout":
    case "timeout":
      return "timeout";
    case "rate_limited":
      return "rate_limited";
    case "bad_request":
    case "unsupported_media_type":
    case "forbidden":
    case "not_here":
    case "forced":
      return "bad_request";
  }
  if (code.startsWith("model_") || code === "settings_rejected") return "model";
  if (status === 429) return "rate_limited";
  if (status === 0) return "network";
  if (status === 504) return "timeout";
  if (status >= 500) return "model";
  return "bad_request";
}

/** Failures worth waiting out rather than recording: the Quick queue pauses on these. */
export const isPausable = (e: unknown) => e instanceof ApiError && (e.kind === "offline" || e.kind === "network");

/** True for a request the caller cancelled (not a deadline). */
export const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

// ---- Client deadlines (CH-5). A little past the server's own budget (src/mastra/model.ts:
// 80 s light, 180 s careful and writing on the cloud), so the server's message wins when
// it has one. Local Gemma has no server deadline, so the client allows a laptop its time.

export type Effort = "light" | "careful" | "writing" | "plain";

const EFFORT: Record<string, Effort> = {
  "/api/card": "light",
  "/api/check": "light",
  "/api/fit": "careful",
  "/api/import": "careful",
  "/api/questions": "careful",
  "/api/proposals": "careful",
  "/api/kit": "writing",
};

export const DEADLINES: Record<"cloud" | "local", Record<Effort, number>> = {
  cloud: { light: 95_000, careful: 200_000, writing: 280_000, plain: 30_000 },
  local: { light: 300_000, careful: 600_000, writing: 1_200_000, plain: 30_000 },
};

/** The feed reads up to 30 boards on a cold start (and waits 8 s for the hosted feed on the desktop). */
const FEED_MS = 75_000;

export function deadlineFor(path: string, tier: Tier): number {
  const route = path.split("?")[0];
  if (route === "/api/feed") return FEED_MS;
  const effort = EFFORT[route] ?? "plain";
  return DEADLINES[tier === "local" ? "local" : "cloud"][effort];
}

/** Both signals: the caller's (Cancel, unmount) and the deadline. */
function withDeadline(signal: AbortSignal | undefined, ms: number): { signal: AbortSignal; deadline: AbortSignal } {
  const deadline = AbortSignal.timeout(ms);
  if (!signal) return { signal: deadline, deadline };
  if (typeof AbortSignal.any === "function") return { signal: AbortSignal.any([signal, deadline]), deadline };
  const c = new AbortController();
  const stop = () => c.abort(signal.aborted ? signal.reason : deadline.reason);
  signal.addEventListener("abort", stop, { once: true });
  deadline.addEventListener("abort", stop, { once: true });
  return { signal: c.signal, deadline };
}

const NO_NETWORK = "You're offline. Deis will carry on when you're back online.";
const UNREACHABLE = "Couldn't reach Deis's server. If you're on the web demo, it may be waking up: try again in a minute.";
const TOO_LONG = "That took too long, so Deis stopped waiting. Try again; on a laptop, a smaller model is faster.";

type ApiOptions = { signal?: AbortSignal; ai?: AiSettings; timeoutMs?: number; headers?: Record<string, string> };

/** The request, with the deadline it runs under and the one way to turn a failure into an ApiError. */
async function send(path: string, body: unknown, opts: ApiOptions) {
  const ai = opts.ai ?? settings();
  const ms = opts.timeoutMs ?? deadlineFor(path, tierOf(ai));
  const { signal, deadline } = ms > 0 ? withDeadline(opts.signal, ms) : { signal: opts.signal, deadline: null };
  /** A deadline becomes "timeout", the caller's own abort is rethrown, anything else is a network failure. */
  const lost = (e: unknown): never => {
    if (deadline?.aborted && !opts.signal?.aborted) throw new ApiError(TOO_LONG, "timeout", 0, "timeout");
    if ((e as Error).name === "AbortError") throw e;
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    throw offline ? new ApiError(NO_NETWORK, "offline", 0, "offline") : new ApiError(UNREACHABLE, "network", 0, "network");
  };
  try {
    const res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { ...opts.headers, "content-type": "application/json", [AI_HEADER]: encodeSettings(ai) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    return { res, deadline, lost };
  } catch (e) {
    return lost(e);
  }
}

/** A failed response as an ApiError, with the server's message when it sent one. */
function refused(res: Response, data: { message?: string; error?: string } | null): ApiError {
  const retry = Number(res.headers.get("retry-after"));
  return new ApiError(data?.message ?? `Something went wrong (${res.status}).`, data?.error ?? "error", res.status, undefined, Number.isFinite(retry) && retry > 0 ? retry : undefined);
}

/**
 * Call a Deis API route. GET without a body, POST with one. Throws ApiError (with a kind)
 * for every failure except a caller's own abort, which rethrows the AbortError.
 * opts.timeoutMs overrides the per-route deadline; 0 turns it off.
 */
export async function api<T>(path: string, body?: unknown, opts: ApiOptions = {}): Promise<T> {
  const { res, deadline, lost } = await send(path, body, opts);
  let data: { message?: string; error?: string } | null;
  try {
    data = await res.json();
  } catch (e) {
    if (deadline?.aborted && !opts.signal?.aborted) lost(e);
    if ((e as Error).name === "AbortError") throw e;
    data = null;
  }
  if (!res.ok) throw refused(res, data);
  return data as T;
}

/**
 * The same call to a route that streams its progress (KIT_STREAM): each line but the last
 * goes to onLine, and the last is the answer or the error. Same deadline, same errors.
 */
export async function apiStream<T, L>(path: string, body: unknown, onLine: (line: L) => void, opts: ApiOptions = {}): Promise<T> {
  const { res, lost } = await send(path, body, { ...opts, headers: { ...opts.headers, accept: KIT_STREAM } });
  if (!res.ok || !res.body || !res.headers.get("content-type")?.includes(KIT_STREAM)) {
    if (!res.ok) throw refused(res, await res.json().catch(() => null));
    // A route that answered with plain JSON after all.
    return (await res.json().catch(lost)) as T;
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read().catch(lost);
    buffer += value ?? "";
    const lines = buffer.split("\n");
    buffer = done ? "" : lines.pop()!;
    for (const raw of lines) {
      if (!raw.trim()) continue;
      const line = JSON.parse(raw) as { type: string; data?: unknown; status?: number; error?: string; message?: string };
      if (line.type === "result") return line.data as T;
      if (line.type === "error") throw new ApiError(line.message ?? `Something went wrong (${line.status}).`, line.error ?? "error", line.status ?? 502);
      onLine(line as L);
    }
    // The connection closed before the answer: the server went away mid-kit.
    if (done) throw new ApiError(UNREACHABLE, "network", 0, "network");
  }
}
