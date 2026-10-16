"use client";

import { BellRinging, Bookmark } from "@phosphor-icons/react";
import { db, STATUS_LABEL, type Application, type Swipe } from "@/lib/client/db";
import { newApplication } from "@/lib/client/kit";
import { routeHref, useStore } from "@/lib/client/store";
import { Button, Pill } from "../ui";
import { fitPill, followUpDue, nextStep, shortDate } from "./logic";

// The applications themselves: a table from md up, cards on phones. Saved-for-later jobs
// sit in the same list with Apply and Remove.

export type Row = { kind: "app"; app: Application } | { kind: "saved"; swipe: Swipe & { job: NonNullable<Swipe["job"]> } };

const keyOf = (r: Row) => (r.kind === "app" ? r.app.id : `saved-${r.swipe.jobId}`);

function NextStep({ app, working }: { app: Application; working: string | null }) {
  const n = nextStep(app, working);
  const due = followUpDue(app);
  return (
    <span className="grid justify-items-start gap-1">
      {due && (
        <Pill tone="ochre" icon={<BellRinging size={14} weight="fill" aria-hidden />}>
          Follow up
        </Pill>
      )}
      <span className={`text-body ${n.tone === "error" ? "font-medium text-brick" : n.tone === "go" ? "font-medium text-accent-text" : "text-ink-2"}`}>{n.text}</span>
    </span>
  );
}

function SavedActions({ swipe }: { swipe: Swipe & { job: NonNullable<Swipe["job"]> } }) {
  const { go } = useStore();
  return (
    <span className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="primary"
        onClick={async () => {
          await db.applications.put(newApplication(swipe.job, "careful"));
          await db.swipes.update(swipe.jobId, { dir: "apply" });
          go({ name: "application", id: swipe.jobId });
        }}
      >
        Apply<span className="sr-only"> to {swipe.job.title}</span>
      </Button>
      <Button size="sm" variant="ghost" onClick={() => db.swipes.delete(swipe.jobId)}>
        Remove<span className="sr-only"> {swipe.job.title}</span>
      </Button>
    </span>
  );
}

function JobCell({ row }: { row: Row }) {
  const job = row.kind === "app" ? row.app.job : row.swipe.job;
  return (
    <span className="grid min-w-0 gap-0.5">
      {row.kind === "app" ? (
        <a href={routeHref({ name: "application", id: row.app.id })} className="font-bold text-ink underline-offset-2 hover:underline">
          {job.title}
        </a>
      ) : (
        <span className="font-bold text-ink">{job.title}</span>
      )}
      <span className="text-caption text-ink-2">
        {job.company}
        {job.city ? `, ${job.city}` : ""}
      </span>
    </span>
  );
}

function StatusCell({ row }: { row: Row }) {
  if (row.kind === "saved")
    return (
      <span className="inline-flex items-center gap-1.5 text-body text-ink-2">
        <Bookmark size={16} aria-hidden />
        Saved for later
      </span>
    );
  return <span className="text-body text-ink">{STATUS_LABEL[row.app.status]}</span>;
}

function FitCell({ row }: { row: Row }) {
  const p = row.kind === "app" ? fitPill(row.app.fit) : null;
  return p ? <Pill tone={p.tone}>{p.label}</Pill> : <span className="text-caption text-ink-3">Not checked yet</span>;
}

export function AppList({ rows, working }: { rows: Row[]; working: string | null }) {
  return (
    <>
      {/* md and up: a table. */}
      <div className="hidden overflow-hidden rounded-surface border border-line bg-raised shadow-card md:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Your applications</caption>
          <thead>
            <tr className="border-b border-line text-caption text-ink-3">
              <th scope="col" className="px-4 py-3 font-medium">
                Job
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Fit
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-medium whitespace-nowrap">
                Added
              </th>
              <th scope="col" className="px-4 py-3 font-medium whitespace-nowrap">
                Applied
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Next step
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={keyOf(r)} className="border-b border-line align-top last:border-b-0 hover:bg-surface">
                <td className="max-w-[300px] px-4 py-3">
                  <JobCell row={r} />
                </td>
                <td className="px-4 py-3">
                  <FitCell row={r} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusCell row={r} />
                </td>
                <td className="num px-4 py-3 text-body whitespace-nowrap text-ink-2">{shortDate(r.kind === "app" ? r.app.createdAt : r.swipe.at)}</td>
                <td className="num px-4 py-3 text-body whitespace-nowrap text-ink-2">{r.kind === "app" ? shortDate(r.app.appliedAt) || "Not yet" : ""}</td>
                <td className="px-4 py-3">{r.kind === "app" ? <NextStep app={r.app} working={working} /> : <SavedActions swipe={r.swipe} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: cards. */}
      <ul className="grid gap-3 md:hidden">
        {rows.map((r) => (
          <li key={keyOf(r)} className="grid gap-3 rounded-surface border border-line bg-raised p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <JobCell row={r} />
              <FitCell row={r} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-2">
              <StatusCell row={r} />
              {r.kind === "app" && r.app.appliedAt ? <span className="num">Applied {shortDate(r.app.appliedAt)}</span> : null}
            </div>
            {r.kind === "app" ? <NextStep app={r.app} working={working} /> : <SavedActions swipe={r.swipe} />}
          </li>
        ))}
      </ul>
    </>
  );
}
