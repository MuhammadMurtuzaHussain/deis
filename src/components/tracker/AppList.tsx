"use client";

import { BellRinging, Bookmark, CaretRight } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { db, STATUS_LABEL, type Application, type Swipe } from "@/lib/client/db";
import { newApplication } from "@/lib/client/kit";
import { routeHref, useStore } from "@/lib/client/store";
import { Button, CompanyMark, MOTION, Pill, useMotion } from "../ui";
import { fitPill, followUpDue, nextStep, shortDate } from "./logic";

// The applications themselves: a table from md up, cards on phones, each with the company's
// mark. A whole application row opens its kit. Saved-for-later jobs sit in the same list
// with Apply and Remove.

export type Row = { kind: "app"; app: Application } | { kind: "saved"; swipe: Swipe & { job: NonNullable<Swipe["job"]> } };

const keyOf = (r: Row) => (r.kind === "app" ? r.app.id : `saved-${r.swipe.jobId}`);

function FollowUp() {
  return (
    <Pill tone="warn" icon={<BellRinging size={14} weight="fill" aria-hidden />}>
      Follow up
    </Pill>
  );
}

function NextStep({ app, working }: { app: Application; working: string | null }) {
  const n = nextStep(app, working);
  return <span className={`text-body ${n.tone === "error" ? "font-medium text-danger" : n.tone === "go" ? "font-medium text-ink" : "text-ink-2"}`}>{n.text}</span>;
}

function SavedActions({ swipe }: { swipe: Swipe & { job: NonNullable<Swipe["job"]> } }) {
  const { go } = useStore();
  return (
    <span className="relative z-[1] flex flex-wrap gap-2">
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

/** The mark, the title (a link that covers the whole row or card for applications) and the company. */
function JobCell({ row }: { row: Row }) {
  const job = row.kind === "app" ? row.app.job : row.swipe.job;
  return (
    <span className="flex min-w-0 items-start gap-3">
      <CompanyMark name={job.company} size={36} className="mt-0.5" />
      <span className="grid min-w-0 gap-0.5">
        {row.kind === "app" ? (
          <a href={routeHref({ name: "application", id: row.app.id })} className="font-semibold leading-snug text-ink underline-offset-2 after:absolute after:inset-0 after:content-[''] hover:underline">
            {job.title}
          </a>
        ) : (
          <span className="font-semibold leading-snug text-ink">{job.title}</span>
        )}
        <span className="text-caption text-ink-2">
          {job.company}
          {job.city ? `, ${job.city}` : ""}
        </span>
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
  return p ? <Pill tone={p.tone}>{p.label}</Pill> : <span className="text-caption text-ink-3">Not checked</span>;
}

const DATE = "num font-mono text-[13px] whitespace-nowrap text-ink-2";

export function AppList({ rows, working }: { rows: Row[]; working: string | null }) {
  // Rows rise in one after another (40 ms apart, the first eight), on arrival and on a filter change.
  const { reduce, t } = useMotion();
  const enter = (i: number) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: t({ ...MOTION.spring, delay: Math.min(i, 8) * 0.04 }),
  });
  return (
    <>
      {/* md and up: a table. */}
      <div className="hidden overflow-hidden rounded-panel border border-line bg-surface md:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Your applications</caption>
          <thead>
            <tr className="border-b border-line text-caption text-ink-3">
              <th scope="col" className="py-3 pr-4 pl-5 font-medium">
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
              <th scope="col" className="py-3 pr-5 pl-4 font-medium">
                Next step
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <motion.tr key={keyOf(r)} {...enter(i)} className="relative align-top transition-colors hover:bg-sunken/60">
                <td className="max-w-[340px] py-4 pr-4 pl-5">
                  <JobCell row={r} />
                </td>
                <td className="px-4 py-4">
                  <FitCell row={r} />
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <StatusCell row={r} />
                </td>
                <td className={`px-4 py-4 ${DATE}`}>{shortDate(r.kind === "app" ? r.app.createdAt : r.swipe.at)}</td>
                <td className={`px-4 py-4 ${DATE}`}>{r.kind === "app" ? shortDate(r.app.appliedAt) || <span className="font-sans text-caption text-ink-3">Not yet</span> : ""}</td>
                <td className="py-4 pr-5 pl-4">
                  {r.kind === "app" ? (
                    <span className="grid justify-items-start gap-1.5">
                      {followUpDue(r.app) && <FollowUp />}
                      <NextStep app={r.app} working={working} />
                    </span>
                  ) : (
                    <SavedActions swipe={r.swipe} />
                  )}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: cards. */}
      <ul className="grid gap-2.5 md:hidden">
        {rows.map((r, i) => (
          <motion.li key={keyOf(r)} {...enter(i)} className="relative grid gap-3 rounded-panel border border-line bg-surface p-4 transition-transform active:scale-[0.99]">
            <div className="flex items-start justify-between gap-3">
              <JobCell row={r} />
              {r.kind === "app" && <CaretRight size={16} aria-hidden className="mt-2 shrink-0 text-ink-3" />}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <FitCell row={r} />
              {r.kind === "app" && followUpDue(r.app) && <FollowUp />}
              <StatusCell row={r} />
              {r.kind === "app" && r.app.appliedAt ? <span className={DATE}>Applied {shortDate(r.app.appliedAt)}</span> : null}
            </div>
            {r.kind === "app" ? (
              <div className="border-t border-line pt-3">
                <NextStep app={r.app} working={working} />
              </div>
            ) : (
              <SavedActions swipe={r.swipe} />
            )}
          </motion.li>
        ))}
      </ul>
    </>
  );
}
