"use client";

import { DownloadSimple } from "@phosphor-icons/react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, STATUS_LABEL, STATUSES, type Application } from "@/lib/client/db";
import { newApplication } from "@/lib/client/kit";
import { routeHref, useStore } from "@/lib/client/store";
import { useKitQueue } from "./KitQueue";
import { Button } from "./ui";

// Every application in one place, by status, with a gentle nudge to follow up a week
// after applying (normal in Ireland, and most people don't). Export to CSV any time.

const day = 86_400_000;

function stateLine(a: Application, working: string | null): string {
  if (a.kitError) return "Kit failed. Open to try again.";
  if (!a.kit) return working === a.id ? "Building the kit now" : a.lane === "careful" ? "Waiting on your answers" : "Kit queued";
  if (a.status === "ready") return "Kit ready. Review it, then apply.";
  if (a.status === "applied" && a.appliedAt) {
    const d = Math.floor((Date.now() - a.appliedAt) / day);
    return d >= 7 ? `Applied ${d} days ago. A short follow-up email is normal now.` : `Applied ${d === 0 ? "today" : `${d} day${d > 1 ? "s" : ""} ago`}`;
  }
  return STATUS_LABEL[a.status];
}

function toCsv(apps: Application[]): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [["Company", "Role", "Location", "Status", "Applied", "Link", "Notes"]];
  for (const a of apps) rows.push([a.job.company, a.job.title, a.job.location, STATUS_LABEL[a.status], a.appliedAt ? new Date(a.appliedAt).toISOString().slice(0, 10) : "", a.job.url, a.notes]);
  return rows.map((r) => r.map(q).join(",")).join("\n");
}

export function Tracker() {
  const { go } = useStore();
  const apps = useLiveQuery(() => db.applications.orderBy("updatedAt").reverse().toArray(), [], []);
  const saved = useLiveQuery(() => db.swipes.where("dir").equals("save").toArray(), [], []);
  const { working } = useKitQueue();

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Applications</h1>
          <p className="mt-2 text-ink-2">
            <span className="num">{apps.length}</span> so far. Kits stay on this device.
          </p>
        </div>
        {apps.length > 0 && (
          <Button
            onClick={() => {
              const url = URL.createObjectURL(new Blob([toCsv(apps)], { type: "text/csv" }));
              Object.assign(document.createElement("a"), { href: url, download: "deis-applications.csv" }).click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            <DownloadSimple size={18} aria-hidden />
            Export CSV
          </Button>
        )}
      </div>

      {apps.length === 0 && saved.length === 0 && (
        <div className="grid gap-3 rounded-surface border border-dashed border-line p-8">
          <p className="text-lg font-bold">Nothing yet</p>
          <p className="text-ink-2">Swipe right on a job and its kit appears here.</p>
          <Button variant="primary" className="w-fit" onClick={() => go({ name: "deck" })}>
            Go to jobs
          </Button>
        </div>
      )}

      {STATUSES.map((s) => {
        const list = apps.filter((a) => a.status === s);
        if (!list.length) return null;
        return (
          <section key={s} aria-labelledby={`st-${s}`} className="grid gap-3">
            <h2 id={`st-${s}`} className="text-lg font-bold">
              {STATUS_LABEL[s]} <span className="num font-normal text-ink-3">{list.length}</span>
            </h2>
            <ul className="grid gap-2">
              {list.map((a) => (
                <li key={a.id}>
                  <a href={routeHref({ name: "application", id: a.id })} className="grid gap-1 rounded-surface border border-line bg-surface p-4 transition hover:border-ink-3 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6">
                    <span>
                      <span className="block font-bold">{a.job.title}</span>
                      <span className="text-ink-2">
                        {a.job.company}, {a.job.city}
                      </span>
                    </span>
                    <span className={`text-sm ${a.kitError ? "text-brick" : a.kit && a.status === "ready" ? "text-accent-text" : "text-ink-2"}`}>{stateLine(a, working)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {saved.length > 0 && (
        <section aria-labelledby="saved" className="grid gap-3">
          <h2 id="saved" className="text-lg font-bold">
            Saved for later <span className="num font-normal text-ink-3">{saved.length}</span>
          </h2>
          <ul className="grid gap-2">
            {saved.map(
              (s) =>
                s.job && (
                  <li key={s.jobId} className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-line bg-surface p-4">
                    <span>
                      <span className="block font-bold">{s.job.title}</span>
                      <span className="text-ink-2">{s.job.company}</span>
                    </span>
                    <span className="flex gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={async () => {
                          await db.applications.put(newApplication(s.job!, "careful"));
                          await db.swipes.update(s.jobId, { dir: "apply" });
                          go({ name: "application", id: s.jobId });
                        }}
                      >
                        Apply
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => db.swipes.delete(s.jobId)}>
                        Remove
                      </Button>
                    </span>
                  </li>
                ),
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
