import { describe, expect, it } from "vitest";
import type { Application } from "@/lib/client/db";
import { csvCell, fitPill, followUpDue, nextStep, stageCounts, stageOf, toCsv } from "@/components/tracker/logic";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 16, 12);

const app = (o: Partial<Application> = {}): Application => ({
  id: "j1",
  job: { company: "Corrib Health", title: "Graduate Data Analyst", location: "Galway, Ireland", url: "https://example.ie/job", city: "Galway" } as Application["job"],
  lane: "quick",
  status: "ready",
  fit: null,
  fitEvents: [],
  kit: null,
  kitError: null,
  notes: "",
  createdAt: NOW - 10 * DAY,
  updatedAt: NOW,
  appliedAt: null,
  ...o,
});

const req = (match: "strong" | "transferable" | "gap") => ({ need: "x", match, facts: [], note: "" });

describe("csvCell", () => {
  it("quotes and doubles quotes", () => {
    expect(csvCell('Say "hi", then go')).toBe('"Say ""hi"", then go"');
    expect(csvCell(null)).toBe('""');
  });
  it("defuses cells a spreadsheet would run as formulas", () => {
    for (const s of ["=HYPERLINK(\"http://x\")", "+1", "-2+3", "@SUM(A1)", "\tx", "\rx"]) expect(csvCell(s).startsWith(`"'`)).toBe(true);
    expect(csvCell("Dublin = home")).toBe('"Dublin = home"');
  });
  it("puts every posting field through the same escaping", () => {
    const csv = toCsv([app({ job: { ...app().job, company: "=cmd|' /C calc'!A0" }, notes: "@me" })]);
    expect(csv.split("\r\n")[1]).toContain(`"'=cmd|' /C calc'!A0"`);
    expect(csv).toContain(`"'@me"`);
  });
});

describe("pipeline", () => {
  it("puts an application a week after applying in follow up", () => {
    expect(stageOf(app({ status: "applied", appliedAt: NOW - 3 * DAY }), NOW)).toBe("applied");
    expect(stageOf(app({ status: "applied", appliedAt: NOW - 7 * DAY }), NOW)).toBe("followup");
    expect(followUpDue(app({ status: "interview", appliedAt: NOW - 20 * DAY }), NOW)).toBe(false);
    expect(stageOf(app({ status: "offer" }), NOW)).toBe("applied");
    expect(stageOf(app({ status: "closed" }), NOW)).toBe("closed");
  });
  it("counts each stage, saved jobs included", () => {
    const c = stageCounts([app(), app({ status: "applied", appliedAt: NOW - 8 * DAY }), app({ status: "closed" })], 2, NOW);
    expect(c).toEqual({ saved: 2, ready: 1, applied: 0, followup: 1, closed: 1 });
  });
  it("says what to do next", () => {
    expect(nextStep(app({ kitError: "boom" }), null, NOW).tone).toBe("error");
    expect(nextStep(app(), "j1", NOW).text).toBe("Building the kit now");
    expect(nextStep(app({ status: "applied", appliedAt: NOW - 6 * DAY, kit: {} as Application["kit"] }), null, NOW).text).toContain("Follow up in 1 day");
  });
});

describe("fitPill", () => {
  it("is worked out from the requirement matches", () => {
    expect(fitPill(null)).toBeNull();
    expect(fitPill({ requirements: [req("strong"), req("strong"), req("transferable")] })).toEqual({ label: "Strong match", tone: "go" });
    expect(fitPill({ requirements: [req("strong"), req("gap"), req("transferable")] })?.label).toBe("Good fit");
    expect(fitPill({ requirements: [req("gap"), req("gap"), req("strong")] })).toEqual({ label: "Stretch, 2 gaps", tone: "ochre" });
  });
});
