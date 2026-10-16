import { BlockList, isIP } from "node:net";
import { kvHit } from "./kv";
import type { AiSettings } from "../ai/settings";

// Guard-rails for the hosted demo's own Gemma key. A user's own key, Ollama or the
// desktop app is never limited: it's their quota. Counts live in Key Value, so a
// restart or a second instance doesn't reset them.
//
// Each AI route has its own hourly allowance per person, so browsing cards never uses
// up the kit's. A per-person total and a demo-wide hourly and daily budget sit on top,
// because people can change IP address and the key's bill is shared.

export type Limit = "route" | "person" | "hourly" | "daily";

/** All AI routes together, per person per hour. */
const PERSON_HOURLY = 150;

const cap = (v: string | undefined, fallback: number) => (Number(v) > 0 ? Number(v) : fallback);

export const LIMIT_MESSAGES: Record<Limit, string> = {
  route: "You've used this hour's demo allowance for this step. For the best results, run Gemma on your own computer with the Deis app (no limits), or add your own free Google AI Studio key in Settings. Or try again in an hour.",
  person: "You've used this hour's demo allowance. For the best results, run Gemma on your own computer with the Deis app (no limits), or add your own free Google AI Studio key in Settings. Or try again in an hour.",
  hourly: "The demo's free Gemma has used its budget for this hour, shared by everyone trying Deis. Run Gemma on your own computer with the Deis app (no limits), or add your own free Google AI Studio key in Settings. Or try again later.",
  daily: "The demo's free Gemma has used today's budget, shared by everyone trying Deis. Run Gemma on your own computer with the Deis app (no limits), or add your own free Google AI Studio key in Settings. Or try again tomorrow.",
};

/** Which limit this request is over, or null. Only the hosted demo's key is counted. */
export async function demoLimited(req: Request, settings: AiSettings, perHour: number): Promise<Limit | null> {
  if (settings.provider !== "demo" || process.env.DEIS_HOSTED !== "1") return null;
  const hour = Math.floor(Date.now() / 3_600_000);
  const day = Math.floor(Date.now() / 86_400_000);
  const ip = clientIp(req);
  // Narrowest first, so someone over their own limit doesn't spend everyone's budget.
  if ((await kvHit(`rl:${routeOf(req)}:${ip}:${hour}`, 3700)) > perHour) return "route";
  if ((await kvHit(`rl:total:${ip}:${hour}`, 3700)) > PERSON_HOURLY) return "person";
  if ((await kvHit(`rl:demo:${hour}`, 3700)) > cap(process.env.DEMO_HOURLY_CAP, 600)) return "hourly";
  if ((await kvHit(`rl:demo-day:${day}`, 86_500)) > cap(process.env.DEMO_DAILY_CAP, 3000)) return "daily";
  return null;
}

/** Seconds until the window that refused this request resets. */
export function retryAfter(limit: Limit, now = Date.now()): number {
  const window = limit === "daily" ? 86_400_000 : 3_600_000;
  return Math.ceil((window - (now % window)) / 1000);
}

/** "/api/card" → "card". Next's router decides the path, but it still becomes a key, so check it. */
function routeOf(req: Request): string {
  const last = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  return /^[a-z]{1,20}$/.test(last) ? last : "other";
}

// Addresses that are never the client: Render's and Cloudflare's own hops.
const PRIVATE = new BlockList();
for (const [net, bits] of [["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16]] as const) PRIVATE.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [["::1", 128], ["fc00::", 7], ["fe80::", 10]] as const) PRIVATE.addSubnet(net, bits, "ipv6");

/** A header value that is a real IP address, or null. Header strings never become keys as they are. */
function validIp(v: string | null | undefined): string | null {
  const s = v?.trim() ?? "";
  if (s.length > 45 || !/^[0-9a-fA-F.:]+$/.test(s)) return null;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(s);
  if (mapped && isIP(mapped[1]) === 4) return mapped[1];
  return isIP(s) ? s : null;
}

/** IPv6 users usually get a whole /64, so it counts as one person. */
function v6Prefix(ip: string): string {
  const [head, tail] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/**
 * The client's address. Render sits behind Cloudflare, which sets cf-connecting-ip (or
 * true-client-ip) itself. X-Forwarded-For is a fallback, read from the right: clients can
 * put anything at the front, and Render only appends. Anything unreadable is "unknown",
 * which shares one bucket rather than slipping past the limit.
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  let ip = validIp(h.get("cf-connecting-ip")) ?? validIp(h.get("true-client-ip"));
  if (!ip) {
    const hops = (h.get("x-forwarded-for") ?? "").split(",").slice(-10).map(validIp);
    ip = hops.reverse().find((a): a is string => !!a && !PRIVATE.check(a, isIP(a) === 6 ? "ipv6" : "ipv4")) ?? null;
  }
  if (!ip) return "unknown";
  return isIP(ip) === 6 ? v6Prefix(ip) : ip;
}
