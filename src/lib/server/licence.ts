import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isOfflineMode, netFetch } from "./net";

// The paid desktop app's licence. Deis is AGPL: anyone can build it from source and
// switch this off, and that's fine. The €9 buys the signed app, updates and the job
// feed. So the check is gentle: 14 days to try everything, then a Polar licence key,
// checked online once and then trusted offline (re-checked monthly when online).
// Only active in the desktop app (DEIS_DESKTOP=1) with a Polar organisation configured.
// Only a definite answer takes a licence away (Polar says revoked or disabled, or doesn't
// know the key); a busy, refusing or unreachable server never does, and the key itself is
// never deleted. The licence never hides anyone's data: that's the app's job to honour.

const TRIAL_DAYS = 14;
const RECHECK_DAYS = 30;
const DAY = 86_400_000;

/** refusedAt: Polar said no to the stored key. The key stays, so a re-granted key works again. */
type Stored = { firstRunAt: number; key?: string; validatedAt?: number; customer?: string | null; refusedAt?: number };
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
  let raw: string;
  try {
    raw = await readFile(f, "utf8");
  } catch (e) {
    // A file that can't be read is left alone: it may hold a key.
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") return { firstRunAt: Date.now() };
    const fresh = { firstRunAt: Date.now() };
    await save(fresh);
    return fresh;
  }
  try {
    return JSON.parse(raw) as Stored;
  } catch {
    // Damaged: never overwritten here and never a lock-out; a fresh trial until the key is entered again.
    return { firstRunAt: Date.now() };
  }
}

async function save(s: Stored) {
  const f = file()!;
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, JSON.stringify(s, null, 1));
}

type Verdict = { verdict: "granted" | "refused" | "unknown"; customer: string | null };

/** Polar's public licence check (no secret needed): is this key granted for our organisation? */
async function validateWithPolar(key: string): Promise<Verdict> {
  if (isOfflineMode()) return { verdict: "unknown", customer: null };
  try {
    const r = await netFetch("licence", "https://api.polar.sh/v1/customer-portal/license-keys/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: key.trim(), organization_id: org() }),
      signal: AbortSignal.timeout(10_000),
    });
    // 404: Polar doesn't know this key. 403, 429, 5xx and the rest say nothing about the key.
    if (r.status === 404) return { verdict: "refused", customer: null };
    if (!r.ok) return { verdict: "unknown", customer: null };
    const d = (await r.json()) as { status?: string; customer?: { name?: string | null; email?: string | null } };
    if (d.status === "granted") return { verdict: "granted", customer: d.customer?.name ?? null };
    return { verdict: d.status === "revoked" || d.status === "disabled" ? "refused" : "unknown", customer: null };
  } catch {
    return { verdict: "unknown", customer: null };
  }
}

export async function licenceState(): Promise<LicenceState> {
  if (process.env.DEIS_DESKTOP !== "1" || !org() || !file()) return { state: "off" };
  const s = await load();
  if (s.key && s.validatedAt && !s.refusedAt) {
    if (Date.now() - s.validatedAt > RECHECK_DAYS * DAY) {
      const v = await validateWithPolar(s.key);
      if (v.verdict === "granted") await save({ ...s, validatedAt: Date.now(), customer: v.customer });
      else if (v.verdict === "refused") await save({ ...s, refusedAt: Date.now() });
      // Offline, busy or unsure: still licensed, checked again next time.
      if (v.verdict === "refused") return trialOrLocked(s);
    }
    return { state: "licensed", customer: s.customer ?? null };
  }
  return trialOrLocked(s);
}

function trialOrLocked(s: Stored): LicenceState {
  const daysLeft = Math.ceil(TRIAL_DAYS - (Date.now() - s.firstRunAt) / DAY);
  return daysLeft > 0 ? { state: "trial", daysLeft } : { state: "locked" };
}

export async function activate(key: string): Promise<{ ok: boolean; message: string }> {
  if (process.env.DEIS_DESKTOP !== "1" || !org() || !file()) return { ok: true, message: "No licence needed here." };
  if (isOfflineMode()) return { ok: false, message: "Offline mode is on. Turn it off to check your licence key, then turn it back on." };
  const v = await validateWithPolar(key);
  if (v.verdict === "unknown") return { ok: false, message: "Couldn't check the key with the licence server. Check your internet connection and try again." };
  if (v.verdict === "refused") return { ok: false, message: "That key isn't valid. Copy it again from your Polar receipt email." };
  const s = await load();
  await save({ ...s, key: key.trim(), validatedAt: Date.now(), customer: v.customer, refusedAt: undefined });
  return { ok: true, message: v.customer ? `Thanks, ${v.customer}. Deis is yours.` : "Thanks. Deis is yours." };
}
