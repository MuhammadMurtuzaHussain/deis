import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// The paid desktop app's licence. Deis is AGPL: anyone can build it from source and
// switch this off, and that's fine. The €9 buys the signed app, updates and the job
// feed. So the check is gentle: 14 days to try everything, then a Polar licence key,
// checked online once and then trusted offline (re-checked monthly when online).
// Only active in the desktop app (DEIS_DESKTOP=1) with a Polar organisation configured.

const TRIAL_DAYS = 14;
const RECHECK_DAYS = 30;
const DAY = 86_400_000;

type Stored = { firstRunAt: number; key?: string; validatedAt?: number; customer?: string | null };
export type LicenceState =
  | { state: "off" }
  | { state: "trial"; daysLeft: number }
  | { state: "licensed"; customer: string | null }
  | { state: "locked" };

const file = () => process.env.DEIS_LICENCE_FILE;
const org = () => process.env.DEIS_POLAR_ORG_ID;
export const buyUrl = () => process.env.DEIS_BUY_URL ?? "https://github.com/MuhammadMurtuzaHussain/deis#get-the-app";

async function load(): Promise<Stored> {
  const f = file()!;
  try {
    return JSON.parse(await readFile(f, "utf8")) as Stored;
  } catch {
    const fresh = { firstRunAt: Date.now() };
    await save(fresh);
    return fresh;
  }
}

async function save(s: Stored) {
  const f = file()!;
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, JSON.stringify(s, null, 1));
}

/** Polar's public licence check (no secret needed): is this key granted for our organisation? */
async function validateWithPolar(key: string): Promise<{ ok: boolean; customer: string | null; reachable: boolean }> {
  try {
    const r = await fetch("https://api.polar.sh/v1/customer-portal/license-keys/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: key.trim(), organization_id: org() }),
      signal: AbortSignal.timeout(10_000),
    });
    if (r.status >= 500) return { ok: false, customer: null, reachable: false };
    if (!r.ok) return { ok: false, customer: null, reachable: true };
    const d = (await r.json()) as { status?: string; customer?: { name?: string | null; email?: string | null } };
    return { ok: d.status === "granted", customer: d.customer?.name ?? null, reachable: true };
  } catch {
    return { ok: false, customer: null, reachable: false };
  }
}

export async function licenceState(): Promise<LicenceState> {
  if (process.env.DEIS_DESKTOP !== "1" || !org() || !file()) return { state: "off" };
  const s = await load();
  if (s.key && s.validatedAt) {
    if (Date.now() - s.validatedAt > RECHECK_DAYS * DAY) {
      const v = await validateWithPolar(s.key);
      // Offline is fine: only a definite "no" from Polar takes the licence away.
      if (v.reachable && !v.ok) {
        await save({ firstRunAt: s.firstRunAt });
      } else if (v.ok) await save({ ...s, validatedAt: Date.now(), customer: v.customer });
      if (v.reachable && !v.ok) return licenceState();
    }
    return { state: "licensed", customer: s.customer ?? null };
  }
  const daysLeft = Math.ceil(TRIAL_DAYS - (Date.now() - s.firstRunAt) / DAY);
  return daysLeft > 0 ? { state: "trial", daysLeft } : { state: "locked" };
}

export async function activate(key: string): Promise<{ ok: boolean; message: string }> {
  if (process.env.DEIS_DESKTOP !== "1" || !org() || !file()) return { ok: true, message: "No licence needed here." };
  const v = await validateWithPolar(key);
  if (!v.reachable) return { ok: false, message: "Couldn't reach the licence server. Check your internet connection and try again." };
  if (!v.ok) return { ok: false, message: "That key isn't valid. Copy it again from your Polar receipt email." };
  const s = await load();
  await save({ ...s, key: key.trim(), validatedAt: Date.now(), customer: v.customer });
  return { ok: true, message: v.customer ? `Thanks, ${v.customer}. Deis is yours.` : "Thanks. Deis is yours." };
}
