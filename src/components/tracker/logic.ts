import { STATUS_LABEL, type Application, type Swipe } from "@/lib/client/db";
import type { Fit } from "@/lib/cv/schema";
import type { PillTone } from "../ui";

// The tracker's pure parts: which pipeline stage an application is in, its next step,
// a fit pill worked out by code from the fit check, and a CSV that spreadsheets can't
// mistake for formulas (CH-20). Tested in tests/tracker.test.ts.

export const DAY = 86_400_000;
/** A follow-up email is normal about a week after applying. */
export const FOLLOW_UP_AFTER_DAYS = 7;

export const STAGES = ["saved", "ready", "applied", "followup", "closed"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = { saved: "Saved", ready: "Ready", applied: "Applied", followup: "Follow up", closed: "Closed" };

/** Days since applying, or null when not applied. */
export const daysSince = (at: number | null | undefined, now = Date.now()) => (at ? Math.max(0, Math.floor((now - at) / DAY)) : null);

/** Applied a week or more ago and still waiting: time for a short follow-up email. */
export function followUpDue(a: Pick<Application, "status" | "appliedAt">, now = Date.now()): boolean {
  const d = daysSince(a.appliedAt, now);
  return a.status === "applied" && d !== null && d >= FOLLOW_UP_AFTER_DAYS;
}

/** The pipeline stage of an application. Interviews and offers count as applied. */
export function stageOf(a: Pick<Application, "status" | "appliedAt">, now = Date.now()): Exclude<Stage, "saved"> {
  if (a.status === "closed") return "closed";
  if (a.status === "ready") return "ready";
  return followUpDue(a, now) ? "followup" : "applied";
}

export function stageCounts(apps: Pick<Application, "status" | "appliedAt">[], saved: number, now = Date.now()): Record<Stage, number> {
  const c: Record<Stage, number> = { saved, ready: 0, applied: 0, followup: 0, closed: 0 };
  for (const a of apps) c[stageOf(a, now)]++;
  return c;
}

export type FitPill = { label: string; tone: PillTone };

/**
 * A fit pill from the fit check's requirement matches, counted by code (not the model's
 * own verdict): no gaps and mostly strong is a strong match; one gap is a good fit; more
 * is a stretch.
 */
export function fitPill(fit: Pick<Fit, "requirements"> | null | undefined): FitPill | null {
  const reqs = fit?.requirements ?? [];
  if (!reqs.length) return null;
  const strong = reqs.filter((r) => r.match === "strong").length;
  const gaps = reqs.filter((r) => r.match === "gap").length;
  if (gaps === 0 && strong * 2 >= reqs.length) return { label: "Strong match", tone: "go" };
  if (gaps <= 1) return { label: "Good fit", tone: "neutral" };
  return { label: `Stretch, ${gaps} gaps`, tone: "warn" };
}

/** What to do next, in a few words. working: the id the Quick queue is building now. */
export function nextStep(a: Application, working: string | null, now = Date.now()): { text: string; tone: "error" | "go" | "plain" } {
  if (a.kitError) return { text: "Kit failed. Open it to try again.", tone: "error" };
  if (!a.kit) return { text: working === a.id ? "Building the kit now" : a.lane === "careful" ? "Answer a few questions" : "Kit queued", tone: "plain" };
  switch (a.status) {
    case "ready":
      return { text: "Review the kit, then apply", tone: "go" };
    case "applied": {
      const d = daysSince(a.appliedAt, now);
      if (d !== null && d >= FOLLOW_UP_AFTER_DAYS) return { text: "Send a short follow-up email", tone: "plain" };
      return { text: d === null ? "Wait to hear back" : `Wait to hear back. Follow up in ${FOLLOW_UP_AFTER_DAYS - d} ${FOLLOW_UP_AFTER_DAYS - d === 1 ? "day" : "days"}`, tone: "plain" };
    }
    case "interview":
      return { text: "Prepare for the interview", tone: "plain" };
    case "offer":
      return { text: "Decide on the offer", tone: "plain" };
    case "closed":
      return { text: "Nothing to do", tone: "plain" };
  }
}

/** "16 Oct": short dates for the table. */
export function shortDate(at: number | null | undefined): string {
  if (!at) return "";
  return new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short" }).format(at);
}

/**
 * One CSV cell. Quoted, with quotes doubled; a cell starting with = + - @ (or a tab or
 * carriage return) gets a leading apostrophe so a spreadsheet shows it as text instead of
 * running it as a formula. Posting text is untrusted.
 */
export function csvCell(v: string | number | null | undefined): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const iso = (at: number | null | undefined) => (at ? new Date(at).toISOString().slice(0, 10) : "");

export function toCsv(apps: Application[], saved: Pick<Swipe, "job" | "at">[] = []): string {
  const rows: (string | number | null | undefined)[][] = [["Company", "Role", "Location", "Status", "Fit", "Added", "Applied", "Link", "Notes"]];
  for (const a of apps) rows.push([a.job.company, a.job.title, a.job.location, STATUS_LABEL[a.status], fitPill(a.fit)?.label ?? "", iso(a.createdAt), iso(a.appliedAt), a.job.url, a.notes]);
  for (const s of saved) if (s.job) rows.push([s.job.company, s.job.title, s.job.location, "Saved for later", "", iso(s.at), "", s.job.url, ""]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
