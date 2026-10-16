// Offline, as the app sees it. Three inputs, no probes of our own:
//   browserOnline  the browser's navigator.onLine plus its online/offline events
//   mode           the server's offline switch (GET /api/status, POST /api/offline)
//   reachable      whether the server's last request to the internet got an answer
// The store (store.tsx) keeps this up to date; screens read it with useStore().offline.

export type OfflineMode = "off" | "on" | "forced";

export type OfflineState = {
  browserOnline: boolean;
  mode: OfflineMode;
  /** Undefined until the server has tried the internet at least once. */
  reachable?: boolean;
};

export const initialOffline = (): OfflineState => ({
  browserOnline: typeof navigator === "undefined" ? true : navigator.onLine,
  mode: "off",
});

/**
 * True when new jobs and cloud models are out of reach: offline mode, or this device has no
 * network. A server that merely failed its last outbound call (reachable: false) is not counted:
 * the next request may well work, so screens should try and handle the ApiError instead.
 */
export const isOffline = (s: OfflineState) => s.mode !== "off" || !s.browserOnline;

/** Offline mode is on (by the toggle or forced): the server connects to nothing but this computer. */
export const offlineModeOn = (s: OfflineState) => s.mode !== "off";

/**
 * "Thu 15 Oct" or, with the time, "Thu 15 Oct, 14:05". Irish English, no comma after the day name.
 * Accepts epoch ms, an ISO string or a Date; null for anything unreadable.
 */
export function savedOn(at: number | string | Date | null | undefined, withTime = false): string | null {
  if (at == null) return null;
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-IE", { weekday: "short", day: "numeric", month: "short", ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}) }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  const date = `${get("weekday")} ${get("day")} ${get("month")}`;
  return withTime ? `${date}, ${get("hour")}:${get("minute")}` : date;
}

/** Saved jobs older than this get "some may have closed". */
export const STALE_AFTER_MS = 3 * 86_400_000;

export const isStale = (savedAt: number | null | undefined, now = Date.now()) => savedAt != null && now - savedAt > STALE_AFTER_MS;

export type Banner = { tone: "info" | "warn"; text: string; /** Offer "Work offline" (desktop and local runs, not forced). */ offerOfflineMode: boolean };

/**
 * The app-wide offline banner, or null when everything is normal.
 * feedSavedAt: when the deck's jobs were last saved (db.feedSavedAt()).
 */
export function offlineBanner(s: OfflineState, feedSavedAt: number | null, opts: { hosted?: boolean } = {}): Banner | null {
  const saved = savedOn(feedSavedAt);
  const showing = saved ? ` Showing jobs saved on ${saved}.` : "";
  if (s.mode === "forced") return { tone: "info", text: `Deis was started in offline mode. It connects to nothing but this computer.${showing}`, offerOfflineMode: false };
  if (s.mode === "on") return { tone: "info", text: `Offline mode is on.${showing}`, offerOfflineMode: false };
  if (!s.browserOnline) return { tone: "warn", text: `No internet.${showing}`, offerOfflineMode: !opts.hosted };
  // The server itself is cut off (a local run on a train): same story, different cause.
  if (s.reachable === false && !opts.hosted) return { tone: "warn", text: `Deis can't reach the internet.${showing}`, offerOfflineMode: true };
  return null;
}
