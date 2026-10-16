// A kit's progress while it's written, streamed from /api/kit as one JSON object per
// line (application/x-ndjson): which step of the Mastra workflow started or finished,
// and how many lines the guard removed. Never any text from the kit. The last line is
// the kit itself, or the error the route would have sent as JSON.

export const KIT_STREAM = "application/x-ndjson";

const STEPS = ["cv", "letter", "answers", "assemble", "checks"] as const;
export type KitStepId = (typeof STEPS)[number];
const WRITERS = ["cv", "letter", "answers"] as const;
type Writer = (typeof WRITERS)[number];

export type KitStepEvent = { type: "step"; step: KitStepId; status: "running" | "done"; removed?: number; failed?: boolean; skipped?: boolean };
export type KitStreamLine = KitStepEvent | { type: "result"; data: unknown } | { type: "error"; status: number; error: string; message: string };

type Chunk = { type?: string; payload?: { id?: string; status?: string; output?: unknown } };
type PartOutput = { value?: unknown; events?: unknown[]; usage?: unknown; error?: unknown };

/** A Mastra workflow stream chunk, as the client hears it. Null for anything it doesn't need. */
export function stepEvent(chunk: Chunk): KitStepEvent | null {
  const id = chunk.payload?.id as KitStepId | undefined;
  if (!id || !STEPS.includes(id)) return null;
  if (chunk.type === "workflow-step-start") return { type: "step", step: id, status: "running" };
  if (chunk.type !== "workflow-step-result") return null;
  if (!(WRITERS as readonly string[]).includes(id)) return { type: "step", step: id, status: "done" };
  const out = (chunk.payload?.output ?? {}) as PartOutput;
  const failed = chunk.payload?.status !== "success" || Boolean(out.error);
  // A part the user turned off returns at once with nothing in it.
  const skipped = !failed && out.value == null && out.usage == null;
  return { type: "step", step: id, status: "done", removed: Array.isArray(out.events) ? out.events.length : 0, ...(failed ? { failed } : {}), ...(skipped ? { skipped } : {}) };
}

export type KitProgress = { fit: "running" | "done" | null; steps: Partial<Record<KitStepId, Omit<KitStepEvent, "type" | "step">>> };

export const progressStart = (fit: KitProgress["fit"]): KitProgress => ({ fit, steps: {} });
export const withEvent = (p: KitProgress, e: KitStepEvent): KitProgress => ({ ...p, steps: { ...p.steps, [e.step]: { status: e.status, removed: e.removed, failed: e.failed, skipped: e.skipped } } });

const NAME: Record<Writer, string> = { cv: "CV", letter: "letter", answers: "answers" };
const list = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One plain line for the kit's progress: "Fit checked. CV written; the guard removed 2 lines. Still writing the letter and answers." */
export function progressLine(p: KitProgress): string {
  if (p.fit === "running") return "Checking how you fit the role.";
  const fit = p.fit === "done" ? "Fit checked. " : "";
  const s = p.steps;
  const writers = WRITERS.filter((w) => !s[w]?.skipped);
  const done = writers.filter((w) => s[w]?.status === "done" && !s[w]?.failed);
  const failed = writers.filter((w) => s[w]?.failed);
  const waiting = writers.filter((w) => s[w]?.status !== "done");
  const removed = writers.reduce((n, w) => n + (s[w]?.removed ?? 0), 0);
  const guard = removed ? `; the guard removed ${removed} ${removed === 1 ? "line" : "lines"}` : "";
  const lost = failed.length ? ` The ${list(failed.map((w) => NAME[w]))} didn't come through.` : "";
  if (s.assemble || s.checks) return `${fit}All written${guard}. Putting your kit together.${lost}`;
  if (!done.length && !failed.length) return `${fit}Writing your ${list(waiting.map((w) => NAME[w]))}.`;
  const wrote = done.length ? `${capital(list(done.map((w) => NAME[w])))} written${guard}.` : "";
  const still = waiting.length ? ` Still writing the ${list(waiting.map((w) => NAME[w]))}.` : "";
  return `${fit}${wrote}${still}${lost}`.trim();
}
