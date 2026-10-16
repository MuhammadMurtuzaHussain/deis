import net from "node:net";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// The one door out of the Deis server. Every outbound fetch names its purpose and goes
// through netFetch, so offline mode is a single check. Underneath, a socket-level guard
// refuses any non-loopback connection while offline, which also covers code that
// doesn't use netFetch (Sentry, ioredis, anything added later). Loopback stays open:
// Ollama on 127.0.0.1:11434 and the Deis server itself.
//
// Offline mode is forced by DEIS_OFFLINE=1 (the desktop's --offline), or switched on in
// the app and kept in offline.json under DEIS_STATE_DIR (the desktop's userData). Without
// a state dir (pnpm dev) the switch lasts until the server restarts.

export class OfflineError extends Error {
  readonly code = "DEIS_OFFLINE";
  constructor(message = "Offline mode is on, so Deis didn't connect to the internet.", options?: ErrorOptions) {
    super(message, options);
    this.name = "OfflineError";
  }
}

export type OfflineMode = "off" | "on" | "forced";

// Kept on globalThis: Next bundles instrumentation and the routes separately, and the
// socket guard must read the same switch the /api/offline route writes.
type NetState = { toggle?: boolean; guard?: boolean; reachable?: boolean; hooks?: (() => void)[] };
const KEY = Symbol.for("deis.net");
const state = (): NetState => ((globalThis as Record<symbol, NetState>)[KEY] ??= {});

const stateFile = () => (process.env.DEIS_STATE_DIR ? path.join(process.env.DEIS_STATE_DIR, "offline.json") : null);

function toggle(): boolean {
  const s = state();
  if (s.toggle === undefined) {
    const f = stateFile();
    try {
      s.toggle = f ? Boolean((JSON.parse(readFileSync(f, "utf8")) as { on?: boolean }).on) : false;
    } catch {
      s.toggle = false;
    }
  }
  return s.toggle;
}

export function offlineMode(): OfflineMode {
  if (process.env.DEIS_OFFLINE === "1") return "forced";
  // The hosted demo never goes offline.
  if (process.env.DEIS_HOSTED === "1") return "off";
  return toggle() ? "on" : "off";
}

export const isOfflineMode = () => offlineMode() !== "off";

/**
 * Run when offline mode is switched on. The socket guard only stops new connections, so code
 * that keeps one open (ioredis) closes it here.
 */
export function onOffline(hook: () => void) {
  (state().hooks ??= []).push(hook);
}

export function setOfflineMode(on: boolean) {
  state().toggle = on;
  if (on)
    for (const hook of state().hooks ?? []) {
      try {
        hook();
      } catch (e) {
        console.warn("[net] an offline hook failed:", e instanceof Error ? e.message : e);
      }
    }
  const f = stateFile();
  if (!f) return;
  try {
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, JSON.stringify({ on }));
  } catch (e) {
    console.warn("[net] couldn't save the offline switch:", e instanceof Error ? e.message : e);
  }
}

/** Whether the last outbound request got an answer. Undefined until one is tried. */
export const lastReachable = () => state().reachable;

const LOOPBACK_HOST = /^(localhost|127(?:\.\d{1,3}){3}|::1|::ffff:127(?:\.\d{1,3}){3})$/i;

export const isLoopbackHost = (host: string) => LOOPBACK_HOST.test(host.replace(/^\[|\]$/g, ""));

export function isLoopback(url: string | URL): boolean {
  try {
    return isLoopbackHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

const NO_NETWORK = new Set(["DEIS_OFFLINE", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH", "ENETDOWN"]);

function codes(e: unknown): string[] {
  const out: string[] = [];
  for (let x = e, i = 0; x && typeof x === "object" && i < 6; x = (x as { cause?: unknown }).cause, i++) {
    const code = (x as { code?: unknown }).code;
    if (typeof code === "string") out.push(code);
    for (const inner of (x as { errors?: unknown[] }).errors ?? []) {
      const c = (inner as { code?: unknown })?.code;
      if (typeof c === "string") out.push(c);
    }
  }
  return out;
}

/** Blocked by offline mode, anywhere in the cause chain. */
export const isOfflineError = (e: unknown) => codes(e).includes("DEIS_OFFLINE");

/** No route to the internet: blocked, no DNS, or no network at all. */
export const isNoNetwork = (e: unknown) => codes(e).some((c) => NO_NETWORK.has(c));

/** fetch, with a purpose for the logs, refused for anything but loopback while offline. */
export async function netFetch(purpose: string, url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const target = url instanceof Request ? url.url : url;
  const local = isLoopback(target);
  if (!local && isOfflineMode()) throw new OfflineError(`Offline mode is on, so Deis didn't connect to ${hostOf(target)} (${purpose}).`);
  try {
    const res = await fetch(url, init);
    if (!local) state().reachable = true;
    return res;
  } catch (e) {
    if (!local && isNoNetwork(e)) state().reachable = false;
    throw e;
  }
}

/** For SDKs that take a `fetch` option (the AI SDK providers). */
export const guardedFetch =
  (purpose: string): typeof fetch =>
  (input, init) =>
    netFetch(purpose, input instanceof Request ? input : String(input), init);

function hostOf(url: string | URL): string {
  try {
    return new URL(url).host;
  } catch {
    return "an outside address";
  }
}

/**
 * While offline, refuse every TCP connection that isn't to loopback, before any DNS
 * lookup. Unix sockets and named pipes pass. Checked per connection, so the switch
 * works without a restart. undici, https and tls all connect through Socket#connect.
 */
export function installEgressGuard() {
  const s = state();
  if (s.guard) return;
  s.guard = true;
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
    if (isOfflineMode()) {
      const first = Array.isArray(args[0]) ? args[0][0] : args[0];
      const opts = (first && typeof first === "object" ? first : typeof first === "string" && !/^\d+$/.test(first) ? { path: first } : { port: first, host: args[1] }) as { path?: string; host?: string };
      const host = typeof opts.host === "string" ? opts.host : "localhost";
      if (!opts.path && !isLoopbackHost(host)) {
        const err = new OfflineError(`Offline mode blocked a connection to ${host}.`);
        process.nextTick(() => this.destroy(err));
        return this;
      }
    }
    return (connect as (...a: unknown[]) => net.Socket).apply(this, args);
  } as typeof connect;
}
