"use client";

import { ArrowClockwise, Hammer, PauseCircle } from "@phosphor-icons/react";
import { useLiveQuery } from "dexie-react-hooks";
import type { ReactNode } from "react";
import { db } from "@/lib/client/db";
import { isStale, savedOn } from "@/lib/client/offline";
import type { Preferences } from "@/lib/profile/types";
import { categoriesForTitle, categoryById } from "@/lib/jobs/categories";
import type { DeckEntry } from "@/lib/jobs/rank";
import { WORK_FIT_COPY, WORK_STATUS_LABEL } from "@/lib/jobs/rightToWork";
import { postedAgo } from "../JobCard";
import { useKitQueue } from "../KitQueue";
import { BarList, Button, Elapsed, Surface } from "../ui";
import type { HiddenBar } from "./logic";

// The deck's right-hand column (UX-8): where this card sits, why Deis showed it, pay and
// dates, what Deis hid and why (PRD-9: bars, not a <details>), the background kit queue,
// and when the jobs were saved. Below the card on phones.

const SOURCE: Record<DeckEntry["job"]["source"], string> = {
  greenhouse: "The company's own job board",
  ashby: "The company's own job board",
  google_jobs: "Google Jobs",
  pasted: "Pasted by you",
};

function Block({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Surface className="grid gap-2.5 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-caption text-ink-3">{label}</h2>
        {action}
      </div>
      {children}
    </Surface>
  );
}

/** Code's reasons this job is in the deck. Nothing here comes from Gemma. */
function reasons(entry: DeckEntry, prefs: Preferences): string[] {
  const { job } = entry;
  const out: string[] = [];
  if (job.source === "pasted") out.push("You added it, so it skips the filters.");
  out.push(
    { early: "It's an early-career role.", open: "It doesn't ask for a level or years.", stretch: "It asks for about 2 years: a stretch.", senior: "It's a senior role." }[job.seniority.level],
  );
  if (job.city === "Ireland") out.push("The posting doesn't say where in Ireland.");
  else if (job.remote && prefs.remoteOk && !prefs.cities.includes(job.city)) out.push("It can be done remotely, which you're open to.");
  else if (prefs.cities.includes(job.city)) out.push(`It's in ${job.city}, one of your places.`);
  const kinds = categoriesForTitle(job.title).filter((c) => prefs.roles.includes(c));
  if (kinds.length) out.push(`It's ${kinds.map((c) => categoryById(c)?.label.toLowerCase() ?? c).join(" and ")} work, as you asked.`);
  if (entry.matched.length) out.push(`It shares ${entry.matched.length} ${entry.matched.length === 1 ? "word" : "words"} with your profile: ${entry.matched.slice(0, 6).join(", ")}.`);
  return out;
}

export function Inspector({
  entry,
  position,
  prefs,
  onShowStretch,
  bars,
  lane,
  saved,
}: {
  entry: DeckEntry | null;
  position: { n: number; total: number } | null;
  prefs: Preferences;
  onShowStretch: () => void;
  bars: HiddenBar[];
  lane: "quick" | "careful" | null;
  saved: { at: number | null; starter: boolean; refreshing: boolean; error: string | null; offline: boolean; refresh: () => void };
}) {
  const hiddenTotal = bars.reduce((s, b) => s + b.value, 0);
  const job = entry?.job;
  const posted = job ? postedAgo(job.postedAt) : null;
  const status = prefs.workStatus;

  return (
    <div className="grid content-start gap-3">
      {entry && job && position && (
        <>
          <Block label="This job">
            <p className="flex items-baseline gap-2">
              <span className="display num text-page leading-none text-ink">{position.n}</span>
              <span className="text-body text-ink-2">of {position.total} in your deck</span>
            </p>
            <ul className="grid gap-1.5 text-body text-ink">
              {reasons(entry, prefs).map((r) => (
                <li key={r} className="flex gap-2">
                  <span aria-hidden className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-ink-3" />
                  {r}
                </li>
              ))}
            </ul>
            {/* PRD-9: always a line for the user's own status, even when the posting says nothing. */}
            <p className={`text-body ${entry.work === "check" ? "text-ochre" : "text-ink-2"}`}>
              {job.rightToWork.stance === "unknown" ? "Doesn't mention permits. Most postings don't." : `${WORK_FIT_COPY[job.rightToWork.stance]}.`}
              {status && <> Your status: {WORK_STATUS_LABEL[status].replace(/^I'll need/, "needs")}.</>}
              {entry.work === "check" && " Check this fits your stamp."}
            </p>
          </Block>

          <Block label="Pay and dates">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-body">
              <dt className="text-ink-2">Pay</dt>
              <dd className={job.salary ? "display num text-ink" : "text-ink-2"}>{job.salary ?? "Not stated"}</dd>
              <dt className="text-ink-2">Posted</dt>
              <dd className="text-ink">{job.source === "pasted" ? "Added by you" : (posted ?? "Not stated")}</dd>
              <dt className="text-ink-2">From</dt>
              <dd className="text-ink">{SOURCE[job.source]}</dd>
            </dl>
          </Block>
        </>
      )}

      {hiddenTotal > 0 && (
        <Block label="Hidden for you">
          <p className="text-body text-ink">
            Deis hid <span className="display num text-lead">{hiddenTotal}</span> {hiddenTotal === 1 ? "job" : "jobs"} that don&apos;t fit what you told it.
          </p>
          <BarList
            items={bars.map((b) => ({
              key: b.key,
              label: b.label,
              value: b.value,
              tone: b.tone,
              detail:
                b.key === "stretch" && !prefs.showStretch ? (
                  <button type="button" onClick={onShowStretch} className="link -mx-1 inline-flex min-h-11 items-center rounded-control px-1 pointer-fine:min-h-0">
                    Show stretch roles too
                  </button>
                ) : undefined,
            }))}
          />
        </Block>
      )}

      <QueueBlock lane={lane} />

      <Block
        label="Saved jobs"
        action={
          <Button size="sm" variant="ghost" busy={saved.refreshing} disabled={saved.offline} onClick={saved.refresh} aria-describedby={saved.offline ? "deck-refresh-why" : undefined}>
            {!saved.refreshing && <ArrowClockwise size={16} aria-hidden />}
            Refresh
          </Button>
        }
      >
        <p className="text-body text-ink">
          {saved.at ? (
            <>
              {saved.starter ? "Starter jobs saved on " : "Jobs saved on "}
              <span className="display">{savedOn(saved.at, true)}</span>.{isStale(saved.at) && " Some may have closed."}
            </>
          ) : (
            "No jobs saved on this device yet."
          )}
        </p>
        {saved.offline && (
          <p id="deck-refresh-why" className="text-caption text-ink-2">
            You&apos;re offline, so Deis can&apos;t look for new jobs. Pasting a job still works.
          </p>
        )}
        {saved.error && !saved.offline && <p className="text-caption text-ochre">{saved.error}</p>}
      </Block>
    </div>
  );
}

function QueueBlock({ lane }: { lane: "quick" | "careful" | null }) {
  const { working, since, waiting, paused } = useKitQueue();
  const app = useLiveQuery(() => (working ? db.applications.get(working) : undefined), [working]);
  const laneLine = lane === "quick" ? "Swiping right builds a Quick kit in the background." : lane === "careful" ? "Swiping right opens the Careful lane: fit first, then your gaps." : "Swiping right asks how you want to apply.";
  return (
    <Block label="Kits">
      {paused && waiting > 0 ? (
        <p className="flex items-start gap-2 text-body text-ochre">
          <PauseCircle size={20} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            Paused with {waiting} {waiting === 1 ? "kit" : "kits"} waiting. {paused.message}
          </span>
        </p>
      ) : working ? (
        <p className="flex items-start gap-2 text-body text-ink">
          <Hammer size={20} aria-hidden className="mt-0.5 shrink-0 text-ink-2" />
          <span>
            Building a kit{app ? ` for ${app.job.title}` : ""}
            {since && (
              <>
                {" "}
                <span className="text-ink-3">
                  (<Elapsed since={since} />)
                </span>
              </>
            )}
            .{waiting > 1 && ` ${waiting - 1} more after this one.`}
          </span>
        </p>
      ) : (
        <p className="text-body text-ink-2">No kits waiting.</p>
      )}
      <p className="text-caption text-ink-2">{laneLine}</p>
    </Block>
  );
}
