"use client";

import { Cards, DownloadSimple } from "@phosphor-icons/react";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db } from "@/lib/client/db";
import { routeHref } from "@/lib/client/store";
import { AddJobButton } from "./AddJob";
import { useKitQueue } from "./KitQueue";
import { AppList, type Row } from "./tracker/AppList";
import { PipelineStrip } from "./tracker/PipelineStrip";
import { stageCounts, stageOf, toCsv, type Stage } from "./tracker/logic";
import { Button, buttonClass, EmptyState, PageHeader, PageSkeleton } from "./ui";

// Every application in one place: a pipeline count strip (Saved, Ready, Applied, Follow up,
// Closed) in big Bricolage numbers, then a table on desktop and cards on phones, each with
// the company's mark, and a warn "Follow up" pill a week after applying (normal in Ireland,
// and most people don't). Export to CSV any time.

export function Tracker() {
  const apps = useLiveQuery(() => db.applications.orderBy("updatedAt").reverse().toArray(), []);
  const saved = useLiveQuery(() => db.swipes.where("dir").equals("save").reverse().sortBy("at"), []);
  const { working } = useKitQueue();
  const [filter, setFilter] = useState<Stage | null>(null);

  const savedJobs = useMemo(() => (saved ?? []).filter((s): s is typeof s & { job: NonNullable<typeof s.job> } => Boolean(s.job)), [saved]);
  const counts = useMemo(() => stageCounts(apps ?? [], savedJobs.length), [apps, savedJobs.length]);
  const rows = useMemo<Row[]>(() => {
    const appRows: Row[] = (apps ?? []).filter((a) => !filter || stageOf(a) === filter).map((app) => ({ kind: "app", app }));
    const savedRows: Row[] = !filter || filter === "saved" ? savedJobs.map((swipe) => ({ kind: "saved", swipe })) : [];
    return filter === "saved" ? savedRows : [...appRows, ...savedRows];
  }, [apps, savedJobs, filter]);

  if (!apps || !saved) return <PageSkeleton />;
  const total = apps.length;

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([toCsv(apps, savedJobs)], { type: "text/csv;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href: url, download: `deis-applications-${new Date().toISOString().slice(0, 10)}.csv` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div>
      <PageHeader
        title="Applications"
        description={
          <>
            <span className="num">{total}</span> {total === 1 ? "application" : "applications"} so far. Kits stay on this device.
          </>
        }
        actions={
          <>
            <AddJobButton label="Add a job I found elsewhere" />
            {(total > 0 || savedJobs.length > 0) && (
              <Button onClick={exportCsv}>
                <DownloadSimple size={18} aria-hidden />
                Export CSV
              </Button>
            )}
          </>
        }
      />

      {total === 0 && savedJobs.length === 0 ? (
        <EmptyState
          icon={<Cards size={24} />}
          title="Nothing here yet"
          action={
            <a href={routeHref({ name: "deck" })} className={buttonClass("primary")}>
              Go to jobs
            </a>
          }
        >
          Swipe right on a job and its kit appears here. Found one somewhere else? Use Add a job above.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:gap-5">
          <PipelineStrip counts={counts} filter={filter} onFilter={setFilter} />
          <p className="sr-only" role="status">
            {filter ? `Showing ${rows.length} ${rows.length === 1 ? "job" : "jobs"}` : ""}
          </p>
          {rows.length ? (
            <AppList rows={rows} working={working} />
          ) : (
            <p className="rounded-panel border border-line bg-surface p-6 text-body text-ink-2">
              Nothing at this stage.{" "}
              <button type="button" className="link" onClick={() => setFilter(null)}>
                Show everything
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
