"use client";

import { ArrowLeft, ArrowSquareOut, X } from "@phosphor-icons/react";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/client/api";
import { db, loadProfile, STATUS_LABEL, STATUSES, type Application, type Status } from "@/lib/client/db";
import { runFit, updateApplication } from "@/lib/client/kit";
import { routeHref, useStore } from "@/lib/client/store";
import { cvSections } from "@/lib/cv/compose";
import { GUARD_VERSION } from "@/lib/cv/schema";
import type { ScoredJob } from "@/lib/jobs/types";
import { Coach } from "./application/Coach";
import { RULE_COPY } from "./application/copy";
import { PrintSheet } from "./application/CvSheet";
import { Inspector } from "./application/Inspector";
import { KitView, type KitTab } from "./application/KitView";
import { RevealProvider, useKitReveal } from "./application/reveal";
import { TraceConnectors } from "./application/TraceConnectors";
import { numberFacts, tracedLines, usage } from "./application/trace";
import { useRewrite } from "./application/useRewrite";
import { TraceProvider, useTrace } from "./application/useTrace";
import { progressLine } from "@/lib/kit-progress";
import { useKitQueue } from "./KitQueue";
import { Button, CompanyMark, Elapsed, LinkButton, Notice, PageHeader, PageSkeleton, Pill, selectClass, Skeleton, type PillTone } from "./ui";

// One application: a header (company mark, the title in Bricolage, pills, one lime "Open the
// posting"), then a two-pane workspace (UX-1). The paper on the left (CV, letter, answers,
// checks), the inspector on the right (fit, right to work, sources, notes). Selecting a fact
// draws the highlighter over the lines that cite it. In the Careful lane Deis asks about the
// gaps first. The parts live in src/components/application/.

export { RULE_COPY };

const LEVEL: Record<ScoredJob["seniority"]["level"], { label: string; tone: PillTone }> = {
  early: { label: "Early career", tone: "neutral" },
  open: { label: "No level stated", tone: "neutral" },
  stretch: { label: "Stretch", tone: "warn" },
  senior: { label: "Senior", tone: "danger" },
};

/** A sheet-shaped placeholder while the kit is being written. */
function PaperPlaceholder() {
  return (
    <div aria-hidden className="grid aspect-[210/297] w-full min-w-0 content-start gap-3 rounded-panel border border-line bg-surface p-8 sm:p-12">
      <Skeleton className="mx-auto h-6 w-48" />
      <Skeleton className="mx-auto mb-4 h-3 w-72 max-w-full" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid gap-2 pt-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

/** On phones the inspector is far below the paper, so the selected fact shows in a small bar. */
function FactPeek() {
  const { active, facts, numbers, uses, select } = useTrace();
  const f = active ? facts.get(active) : null;
  if (!f || !numbers.has(f.id)) return null;
  const used = uses.get(f.id) ?? 0;
  return (
    <div className="fixed inset-x-3 bottom-[calc(var(--mobile-nav)+0.75rem)] z-30 flex items-start gap-3 rounded-panel bg-surface p-3 pl-4 shadow-lift lg:hidden">
      <span aria-hidden className="mt-0.5 grid h-5 min-w-6 shrink-0 place-items-center rounded-full bg-pop px-1 font-mono text-[11px] font-semibold text-pop-ink">
        {numbers.get(f.id)}
      </span>
      <p className="min-w-0 flex-1 text-body text-ink">
        {f.text}
        <span className="block text-caption text-ink-3">{used === 1 ? "Used in 1 line" : `Used in ${used} lines`}</span>
      </p>
      <button type="button" onClick={() => select(null, "slip")} className="-m-1 grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-sunken">
        <X size={18} aria-hidden />
        <span className="sr-only">Close source</span>
      </button>
    </div>
  );
}

/** The Careful lane checks the fit here; the Quick lane's background queue does its own. */
function useCarefulFit(app: Application | null | undefined, locked: boolean) {
  const [since, setSince] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (!app || app.fit || app.lane !== "careful" || locked || started.current) return;
    started.current = true;
    setSince(Date.now());
    (async () => {
      try {
        const out = await runFit(app.job, await loadProfile());
        await updateApplication(app.id, { fit: out.fit, fitEvents: out.events });
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Couldn't check the fit.");
      } finally {
        setSince(null);
      }
    })();
  }, [app, attempt, locked]);
  const retry = () => {
    started.current = false;
    setError(null);
    setAttempt((n) => n + 1);
  };
  return { since, error, retry };
}

export function ApplicationScreen({ id }: { id: string }) {
  const app = useLiveQuery(async () => (await db.applications.get(id)) ?? null, [id]); // null = not found, undefined = still loading
  const factsList = useLiveQuery(() => db.facts.toArray(), [], []);
  const facts = useMemo(() => new Map(factsList.map((f) => [f.id, f])), [factsList]);
  const { profile, locked } = useStore();
  const queue = useKitQueue();
  const fitRun = useCarefulFit(app, locked);
  const rewrite = useRewrite(app);
  const [tab, setTab] = useState<KitTab>("cv");
  const [coaching, setCoaching] = useState(false);
  const reveal = useKitReveal(app);

  // Facts numbered by first use in the document on screen.
  const kit = app?.kit ?? null;
  const lines = useMemo(() => {
    if (!kit) return [];
    if (tab === "letter") return kit.letter?.paragraphs ?? [];
    if (tab === "answers") return kit.answers?.answers ?? [];
    return tracedLines(cvSections(kit.cv));
  }, [kit, tab]);
  const numbers = useMemo(() => numberFacts(lines, (fid) => facts.has(fid)), [lines, facts]);
  const uses = useMemo(() => usage(lines), [lines]);

  if (app === undefined) return <PageSkeleton />;
  if (!app)
    return (
      <div className="grid gap-4">
        <PageHeader title="That application isn't here any more" />
        <a href={routeHref({ name: "tracker" })} className="link w-fit">
          Back to applications
        </a>
      </div>
    );

  const job = app.job;
  const name = profile?.header.name || app.kit?.cv.header.name || "";
  const setStatus = (status: Status) => updateApplication(app.id, { status, appliedAt: status === "applied" && !app.appliedAt ? Date.now() : app.appliedAt });
  const canRewrite = !locked && Boolean(app.fit);
  // The older-rules note is only for a kit not yet sent.
  const stale = Boolean(app.kit) && (app.kit?.guardVersion ?? 1) < GUARD_VERSION && app.status === "ready";
  const level = LEVEL[job.seniority.level];
  const posting = job.url || job.apply[0]?.url;

  const fitPending = app.fit
    ? null
    : fitRun.error
      ? { since: null, waiting: false, error: fitRun.error }
      : app.kitError || locked
        ? { since: null, waiting: false, error: "not checked" }
        : { since: fitRun.since ?? (queue.working === app.id ? queue.since : null), waiting: app.lane === "quick" && queue.working !== app.id && queue.waiting > 0, error: null };

  let left;
  if (app.kit && !coaching) {
    left = <KitView app={app} kit={app.kit} facts={facts} name={name} tab={tab} onTab={setTab} stale={stale} rewrite={rewrite} canRewrite={canRewrite} reveal={reveal} />;
  } else if (app.kit && coaching) {
    left = <Coach app={app} onBuilt={() => setCoaching(false)} onCancel={() => setCoaching(false)} />;
  } else if (locked) {
    left = (
      <Notice tone="warn" announce={false} action={<LinkButton href={routeHref({ name: "licence" })} external={false} size="sm">Buy or enter a key</LinkButton>}>
        Your licence is locked, so Deis can&apos;t write new kits. Everything you already have stays readable.
      </Notice>
    );
  } else if (app.lane === "careful") {
    left = app.fit ? (
      <Coach app={app} onBuilt={() => setTab("cv")} />
    ) : fitRun.error ? (
      <Notice tone="error" action={<Button size="sm" onClick={fitRun.retry}>Try again</Button>}>
        {fitRun.error}
      </Notice>
    ) : (
      <div className="grid gap-4">
        <Notice>Gemma is checking how you fit before asking about your gaps.</Notice>
        <PaperPlaceholder />
      </div>
    );
  } else if (app.kitError) {
    left = (
      <Notice tone="error" action={<Button size="sm" onClick={() => updateApplication(app.id, { kitError: null })}>Try again</Button>}>
        {app.kitError}
      </Notice>
    );
  } else {
    const working = queue.working === app.id && queue.since;
    left = (
      <div className="grid gap-4">
        <Notice>
          {working ? (queue.progress ? progressLine(queue.progress) : "Writing your CV, letter and answers.") : "Your kit is waiting its turn."} {working ? <Elapsed since={queue.since!} /> : null}
        </Notice>
        <PaperPlaceholder />
      </div>
    );
  }

  return (
    <TraceProvider numbers={numbers} uses={uses} facts={facts}>
      <a href={routeHref({ name: "tracker" })} className="-ml-1 mb-4 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-pill pr-3 pl-1 text-body text-ink-2 hover:text-ink lg:min-h-9">
        <ArrowLeft size={16} aria-hidden />
        Applications
      </a>
      <header className="mb-6 grid gap-5 lg:mb-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-10">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <CompanyMark name={job.company} />
            <p className="min-w-0 text-body leading-snug">
              <span className="block font-medium text-ink">{job.company}</span>
              <span className="block text-caption text-ink-3">{job.location}</span>
            </p>
          </div>
          <h1 data-page-title tabIndex={-1} className="display mt-4 max-w-[28ch] text-[28px] leading-[1.06] text-ink text-balance sm:text-[32px]">
            {job.title}
          </h1>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Pill tone={level.tone}>{level.label}</Pill>
            {job.remote && <Pill>Remote</Pill>}
            {job.salary && <Pill>{job.salary}</Pill>}
            <Pill>{app.lane === "careful" ? "Careful lane" : "Quick lane"}</Pill>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {posting && (
            <LinkButton href={posting} variant="primary">
              Open the posting
              <ArrowSquareOut size={16} aria-hidden />
            </LinkButton>
          )}
          {app.kit && app.status === "ready" && <Button onClick={() => setStatus("applied")}>I&apos;ve applied</Button>}
          <label className="w-44">
            <span className="sr-only">Status</span>
            <select value={app.status} onChange={(e) => setStatus(e.target.value as Status)} className={selectClass}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
        <div className="min-w-0">
          <RevealProvider plan={reveal.plan}>{left}</RevealProvider>
        </div>
        <Inspector
          app={app}
          facts={facts}
          tab={tab}
          onTab={setTab}
          fitPending={fitPending}
          rebuild={app.kit ? { canRewrite, busy: Boolean(rewrite.busy) || coaching, again: () => rewrite.run(stale), careful: () => setCoaching(true) } : null}
        />
      </div>

      {app.kit && <PrintSheet cv={app.kit.cv} />}
      <TraceConnectors />
      <FactPeek />
    </TraceProvider>
  );
}
