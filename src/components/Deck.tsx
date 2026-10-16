"use client";

import { ArrowClockwise, Cards, Lightning, Path, WarningCircle } from "@phosphor-icons/react";
import { useLiveQuery } from "dexie-react-hooks";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CardWhy } from "@/lib/ai/schema";
import { api, ApiError, isAbort, isPausable } from "@/lib/client/api";
import { db, factsKey, getCard, getMeta, putCard, setMeta, type CardCache } from "@/lib/client/db";
import { isStale, savedOn } from "@/lib/client/offline";
import { newApplication } from "@/lib/client/kit";
import { useStore } from "@/lib/client/store";
import { categoryById } from "@/lib/jobs/categories";
import { buildDeck, profileTerms, type DeckEntry } from "@/lib/jobs/rank";
import { workFit } from "@/lib/jobs/rightToWork";
import type { ScoredJob } from "@/lib/jobs/types";
import { AddJobButton } from "./AddJob";
import { ActionBar, KeyHint } from "./deck/ActionBar";
import { hiddenBars, pastedFirst, type Dir } from "./deck/logic";
import { HiddenDialog, QueueLine } from "./deck/Status";
import { SwipeCard } from "./deck/SwipeCard";
import { useFeed } from "./deck/useFeed";
import { flyToApplications } from "./deck/fly";
import { useSwipeDeck } from "./deck/useSwipeDeck";
import { WhyShown } from "./deck/Why";
import { JobCard } from "./JobCard";
import { Button, dismissToast, Dialog, EmptyState, IconButton, LinkButton, Notice, PageHeader, RollingNumber, Skeleton, Spinner, toast, useMotion } from "./ui";

// The deck. Code decides which cards you see and in what order (src/lib/jobs/rank.ts);
// Gemma only writes the "how you match" lines, and only for the next three cards, so the
// model never reads a job you won't see. Drag, the round buttons or the arrow keys decide.
// Jobs come from this device first (useFeed), so the deck works offline.

type Lane = "quick" | "careful";
type Decision = { id: string; dir: Dir; job: ScoredJob };
type WhyError = { message: string; retry: boolean };

const SKIP_REASONS = ["Too senior", "Wrong place", "Not my field", "Pay too low", "Company"];

/** The first visit: no saved jobs yet, so say what Deis is doing while the boards are read. */
function DeckLoading({ categories }: { categories: string[] }) {
  const lines = ["Reading the job boards of 30 employers in Ireland", ...categories.map((c) => `Searching Google Jobs for ${categoryById(c)?.label.toLowerCase() ?? c} roles`), "Hiding senior roles and ones that rule you out", "Ranking what's left by your profile"];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, lines.length - 1)), 1400);
    return () => clearInterval(t);
  }, [lines.length]);
  return (
    <div aria-busy="true">
      <CardSkeleton />
      <p className="mt-5 text-center text-body text-ink-2" role="status">
        {lines[i]}
      </p>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div aria-hidden className="relative h-[420px] w-full">
      <div className="absolute inset-x-0 top-3.5 bottom-0 scale-[0.96] rounded-card border border-line bg-surface" />
      <div className="absolute inset-0 bottom-3.5 grid content-start gap-4 rounded-card border border-line bg-surface p-6 shadow-card">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-mark" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        <Skeleton className="mt-2 h-8 w-4/5" />
        <Skeleton className="h-6 w-1/2 rounded-pill" />
        <Skeleton className="mt-6 h-4 w-11/12" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

export function Deck() {
  const { profile, go, setPreferences, isOffline, feedSavedAt, effectiveModel } = useStore();
  const prefs = profile?.preferences;
  const categories = useMemo(() => [...(prefs?.roles ?? [])].sort(), [prefs?.roles]);
  const feed = useFeed(categories, isOffline);
  const swipes = useLiveQuery(() => db.swipes.toArray(), [], null);
  const hintId = useId();
  const deckRef = useRef<HTMLDivElement>(null);
  const { reduce } = useMotion();

  // This session's decisions, newest last: they leave the deck at once (the database catches
  // up a moment later), they count towards "n of N", and Undo walks back through them.
  const [decided, setDecided] = useState<Decision[]>([]);
  const decidedRef = useRef(decided);
  useEffect(() => {
    decidedRef.current = decided;
  }, [decided]);
  const createdApp = useRef(new Set<string>());
  // Each decision's toast, closed when that decision is undone some other way.
  const toasts = useRef(new Map<string, number>());

  const [details, setDetails] = useState<ScoredJob | null>(null);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [laneAsk, setLaneAsk] = useState<ScoredJob | null>(null);
  const [lastSkip, setLastSkip] = useState<ScoredJob | null>(null);
  const [announce, setAnnounce] = useState("");
  const [whyErrors, setWhyErrors] = useState<Record<string, WhyError>>({});
  const [lane, setLaneState] = useState<Lane | null>(null);
  // Decisions can finish after the lane dialog closes, so they read the lane from a ref.
  const laneRef = useRef<Lane | null>(null);
  const setLane = (l: Lane | null) => {
    laneRef.current = l;
    setLaneState(l);
  };
  useEffect(() => {
    void getMeta<Lane | null>("lane", null).then((l) => {
      laneRef.current = l;
      setLaneState(l);
    });
  }, []);

  // ---- which cards, in what order

  const deck = useMemo(() => {
    if (!feed.jobs || !profile || !swipes) return null;
    const seen = new Set([...swipes.map((s) => s.jobId), ...decided.map((d) => d.id)]);
    const built = buildDeck(
      feed.jobs.filter((j) => j.source !== "pasted"),
      profile.preferences,
      profile.facts,
      seen,
    );
    // Pasted jobs skip the filters (the user asked for them) and go on top.
    const terms = profileTerms(profile.facts);
    const toEntry = (job: ScoredJob): DeckEntry => {
      const words = new Set(`${job.title} ${job.description}`.toLowerCase().split(/[^a-z0-9+#.]+/));
      return { job, rank: Infinity, work: workFit(job.rightToWork.stance, profile.preferences.workStatus), matched: [...terms].filter((t) => words.has(t)).slice(0, 8) };
    };
    return { entries: pastedFirst(built.entries, feed.pasted, seen, toEntry), hidden: built.hidden };
  }, [feed.jobs, feed.pasted, profile, swipes, decided]);

  const entries = useMemo(() => deck?.entries ?? [], [deck]);
  const current = entries[0] ?? null;
  const position = current ? { n: decided.length + 1, total: entries.length + decided.length } : null;
  const bars = useMemo(() => (deck ? hiddenBars(deck.hidden, feed.hiddenSenior) : []), [deck, feed.hiddenSenior]);

  const keys = useRef<(a: Dir | "undo") => void>(() => undefined);
  const onKey = useCallback((a: Dir | "undo") => keys.current(a), []);
  const swipe = useSwipeDeck({ enabled: Boolean(current) && !details && !laneAsk && !hiddenOpen, onKey });
  const { setFlow, clear: clearIntent } = swipe;

  // ---- Gemma's "how you match" lines, for the next three cards, one call at a time

  const key = useMemo(() => factsKey(profile?.facts ?? []), [profile?.facts]);
  const next3 = entries.slice(0, 3).map((e) => e.job.id);
  const idsKey = next3.join(",");
  const cards = useLiveQuery(() => Promise.all(idsKey.split(",").filter(Boolean).map((id) => getCard(id, key))), [idsKey, key]);
  const cardMap = useMemo(() => new Map((cards ?? []).filter((c): c is CardCache => Boolean(c)).map((c) => [c.jobId, c])), [cards]);
  const noFacts = !profile?.facts.some((f) => f.confirmed);
  const cantAsk = isOffline && !effectiveModel.worksOffline;
  const asking = useRef(false);
  const askCtl = useRef<AbortController | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!profile || !cards || asking.current || noFacts || cantAsk) return;
    const next = entries.slice(0, 3).find((e) => !cardMap.has(e.job.id) && !whyErrors[e.job.id]);
    if (!next) return;
    asking.current = true;
    const ctl = new AbortController();
    askCtl.current = ctl;
    const confirmed = profile.facts.filter((f) => f.confirmed);
    api<CardWhy>("/api/card", { job: next.job, facts: confirmed, neverClaim: profile.neverClaim }, { signal: ctl.signal })
      .then((r) => putCard({ jobId: next.job.id, why: r.why, score: r.score, at: Date.now(), factsKey: key }))
      .catch((e) => {
        if (isAbort(e)) return;
        const message = e instanceof ApiError ? e.message : "Gemma couldn't read this one.";
        setWhyErrors((m) => ({ ...m, [next.job.id]: { message, retry: isPausable(e) } }));
      })
      .finally(() => {
        asking.current = false;
        setTick((t) => t + 1);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, cardMap, key, whyErrors, tick, noFacts, cantAsk, Boolean(cards)]);
  useEffect(() => () => askCtl.current?.abort(), []);

  // Back online: try again the cards that failed for want of a network.
  useEffect(() => {
    if (cantAsk) return;
    const retry = () => setWhyErrors((m) => Object.fromEntries(Object.entries(m).filter(([, v]) => !v.retry)));
    retry();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [cantAsk]);

  const whyErrorFor = (id: string) => {
    if (noFacts) return "Add and confirm a few facts in your profile, and Gemma will say how you match.";
    if (cantAsk && !cardMap.has(id)) return "You're offline. Gemma will read this one when you're back online.";
    return whyErrors[id]?.message ?? null;
  };

  // ---- deciding and undoing

  const describe = useCallback((list: DeckEntry[], done: number) => {
    const e = list[0];
    return e ? `${e.job.title} at ${e.job.company}. Card ${done + 1} of ${list.length + done}.` : "That's every match for now.";
  }, []);

  const undoId = useCallback(
    async (id: string) => {
      const d = decidedRef.current.find((x) => x.id === id);
      if (!d) return;
      setFlow({ dir: d.dir, kind: "undo", id });
      setDecided((list) => list.filter((x) => x.id !== id));
      setLastSkip(null);
      setAnnounce(`Back: ${d.job.title} at ${d.job.company}.`);
      const shown = toasts.current.get(id);
      if (shown) dismissToast(shown);
      toasts.current.delete(id);
      await db.swipes.delete(id);
      if (createdApp.current.has(id)) {
        createdApp.current.delete(id);
        const app = await db.applications.get(id);
        if (app && !app.kit) await db.applications.delete(id);
      }
    },
    [setFlow],
  );

  const undo = useCallback(() => {
    const last = decidedRef.current.at(-1);
    if (last) void undoId(last.id);
  }, [undoId]);

  const decide = useCallback(
    async (dir: Dir, chosen?: Lane) => {
      const e = entries[0];
      if (!e) return;
      const job = e.job;
      const useLane = chosen ?? laneRef.current;
      // Ask how to apply before the card leaves, so closing the question leaves it in place.
      if (dir === "apply" && !useLane) return setLaneAsk(job);
      // A Quick apply: a copy of the card flies into Applications, where the kit is now being built.
      const topCard = deckRef.current?.querySelector<HTMLElement>("[data-deck-top]");
      if (dir === "apply" && useLane === "quick" && topCard && !reduce) flyToApplications(topCard, job);
      setFlow({ dir, kind: "decide", id: job.id });
      clearIntent();
      setDecided((list) => [...list, { id: job.id, dir, job }]);
      setLastSkip(dir === "skip" ? job : null);
      setAnnounce(describe(entries.slice(1), decidedRef.current.length + 1));
      await db.swipes.put({ jobId: job.id, dir, at: Date.now(), job: dir === "save" ? job : undefined });
      const name = `${job.title} at ${job.company}`;
      const say = (message: string) => toasts.current.set(job.id, toast({ message, undo: () => undoId(job.id) }));
      if (dir === "skip") say(`Skipped. ${name}.`);
      if (dir === "save") say(`Kept for later: ${name}. It's in Applications.`);
      if (dir === "apply" && useLane) {
        if (!(await db.applications.get(job.id))) {
          await db.applications.put(newApplication(job, useLane));
          createdApp.current.add(job.id);
        }
        if (useLane === "careful") return go({ name: "application", id: job.id });
        say(`Building a kit for ${name}. Find it in Applications.`);
      }
    },
    [entries, go, describe, undoId, setFlow, clearIntent, reduce],
  );

  // The keys reach the latest decide and undo through a ref, so the listener isn't re-bound each render.
  useEffect(() => {
    keys.current = (a) => (a === "undo" ? undo() : void decide(a));
  }, [undo, decide]);

  if (!profile || !prefs) return null;

  const matches = deck?.entries.length ?? 0;
  const firstRun = feed.jobs !== null && feed.jobs.length === 0;
  const visible = entries.slice(0, 3);
  const hiddenTotal = bars.reduce((s, b) => s + b.value, 0);
  const canShowStretch = !prefs.showStretch && (deck?.hidden.stretch ?? 0) > 0;
  const showStretch = () => void setPreferences({ ...prefs, showStretch: true });

  let body;
  if (feed.jobs === null || !deck) {
    body = <CardSkeleton />;
  } else if (firstRun && feed.refreshing) {
    body = <DeckLoading categories={categories} />;
  } else if (firstRun && feed.error) {
    body = (
      <div className="grid gap-4">
        <Notice tone="error" action={!isOffline && <Button size="sm" onClick={feed.refresh}>Try again</Button>}>
          {feed.error.message}
        </Notice>
        <EmptyState icon={<WarningCircle size={24} />} title="No jobs on this device yet" action={<AddJobButton variant="primary" />}>
          {isOffline ? "Deis needs the internet once to fetch jobs. Until then, paste a job you found and Deis will tailor it here." : "While the job boards are out of reach, paste a job you found and Deis will tailor it here."}
        </EmptyState>
      </div>
    );
  } else if (!current) {
    body = (
      <EmptyState icon={<Cards size={24} />} title={<TypeLine text="That's every match for now" />} action={<AddJobButton variant="primary" label="Paste a job you found" />}>
        New jobs come in daily. Found one somewhere else? Paste it and Deis will tailor a kit for it.
        {canShowStretch && " Stretch roles are hidden: the hidden count above can show them."}
      </EmptyState>
    );
  } else {
    body = (
      <>
        <div
          ref={deckRef}
          role="group"
          aria-roledescription="card deck"
          aria-label="Job cards"
          aria-describedby={hintId}
          tabIndex={0}
          className="relative mb-8 h-[clamp(340px,calc(100dvh-var(--mobile-nav)-21.5rem),620px)] w-full rounded-card lg:h-[clamp(390px,calc(100dvh-26rem),600px)]"
        >
          <span id={hintId} className="sr-only">
            Right arrow applies, left arrow skips, up arrow keeps it for later. Z or Backspace undoes.
          </span>
          <AnimatePresence custom={swipe.flow} initial={false}>
            {visible
              .map((e, depth) => (
                <SwipeCard
                  key={e.job.id}
                  id={e.job.id}
                  depth={depth as 0 | 1 | 2}
                  intent={swipe.intent}
                  flow={swipe.flow}
                  label={`${e.job.title} at ${e.job.company}`}
                  onTrack={swipe.track}
                  onRelease={(dir) => dir && void decide(dir)}
                >
                  <JobCard
                    job={e.job}
                    work={e.work}
                    why={cardMap.get(e.job.id) ?? null}
                    whyError={whyErrorFor(e.job.id)}
                    onDetails={() => setDetails(e.job)}
                    explain={<WhyShown entry={e} prefs={prefs} />}
                    active={depth === 0}
                  />
                </SwipeCard>
              ))
              // The top card last in the DOM, so a leaving card paints over the one rising underneath.
              .reverse()}
          </AnimatePresence>
        </div>

        <ActionBar onDecide={(d) => void decide(d)} onUndo={undo} canUndo={decided.length > 0} disabled={!current} />
        <KeyHint position={position} />

        {lastSkip && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Why did you skip it? Optional.">
            <span className="w-full text-center text-caption text-ink-3">Why skip? Optional</span>
            {SKIP_REASONS.map((r) => (
              <Button
                key={r}
                size="sm"
                onClick={async () => {
                  await db.swipes.update(lastSkip.id, { reason: r });
                  setLastSkip(null);
                }}
              >
                {r}
              </Button>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[460px] pb-32 lg:pb-0">
      <PageHeader
        className="mb-1! flex-nowrap! items-center! lg:mb-1!"
        title="Jobs for you"
        actions={
          <>
            <IconButton
              label={isOffline ? "You're offline, so Deis can't look for new jobs" : "Look for new jobs"}
              size={40}
              variant="ghost"
              disabled={isOffline || feed.refreshing}
              aria-busy={feed.refreshing || undefined}
              onClick={feed.refresh}
            >
              {feed.refreshing ? <Spinner /> : <ArrowClockwise size={18} weight="bold" aria-hidden />}
            </IconButton>
            <AddJobButton size="sm" label={<span className="max-sm:sr-only">Paste a job</span>} />
          </>
        }
      />
      <MetaLine
        deckReady={Boolean(deck)}
        matches={matches}
        savedAt={feedSavedAt}
        starter={feed.starter}
        hidden={hiddenTotal}
        onHidden={() => setHiddenOpen(true)}
      />
      {feed.error && !firstRun && !isOffline && <p className="mt-1 text-caption text-warn">{feed.error.message}</p>}
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <section aria-label="Your deck" className="mt-5 min-w-0 lg:mt-6">
        {noFacts && (
          <Notice tone="warn" className="mb-4" action={<Button size="sm" onClick={() => go({ name: "profile" })}>Build your profile</Button>}>
            Your profile has no confirmed facts yet, so Deis can&apos;t tailor anything.
          </Notice>
        )}
        {body}
        {deck && <QueueLine lane={lane} />}
      </section>

      <HiddenDialog open={hiddenOpen} onClose={() => setHiddenOpen(false)} bars={bars} canShowStretch={canShowStretch} onShowStretch={showStretch} />

      <Dialog open={Boolean(details)} onClose={() => setDetails(null)} title={details ? `${details.title}, ${details.company}` : ""} description={details?.location} wide>
        {details && (
          <div className="grid gap-4">
            <div className="max-h-[55dvh] overflow-y-auto rounded-panel border border-line bg-bg p-4 text-body leading-relaxed whitespace-pre-line text-ink">
              {details.description || "This board didn't share a description. Open the original posting."}
            </div>
            {details.apply.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {details.apply.slice(0, 3).map((a) => (
                  <LinkButton key={a.url} href={a.url}>
                    Open on {a.label}
                  </LinkButton>
                ))}
              </div>
            ) : (
              <p className="text-caption text-ink-2">You pasted this one without a link, so there&apos;s nothing to open.</p>
            )}
          </div>
        )}
      </Dialog>

      <Dialog open={Boolean(laneAsk)} onClose={() => setLaneAsk(null)} title="How do you want to apply?" description="Deis remembers this. Change it any time in Settings, or pick Careful from any application.">
        <div className="grid gap-2.5">
          {(
            [
              ["quick", "Quick", Lightning, "Deis checks the fit and writes your CV, a letter and draft answers in the background. You keep swiping, then review and apply."],
              ["careful", "Careful", Path, "Deis shows the fit first and asks about your gaps. What you tell it can strengthen your profile for every job after this one."],
            ] as const
          ).map(([l, title, Icon, text]) => (
            <button
              key={l}
              type="button"
              className="grid grid-cols-[40px_1fr] items-start gap-3 rounded-panel border border-control-border bg-surface p-4 text-left transition-[background-color,border-color,transform] hover:border-ink hover:bg-sunken active:scale-[0.99]"
              onClick={async () => {
                await setMeta("lane", l);
                setLane(l);
                setLaneAsk(null);
                void decide("apply", l);
              }}
            >
              <span aria-hidden className="grid size-10 place-items-center rounded-full bg-sunken text-ink">
                <Icon size={20} weight="bold" />
              </span>
              <span>
                <span className="display block text-lead text-ink">{title}</span>
                <span className="mt-1 block text-body text-ink-2">{text}</span>
              </span>
            </button>
          ))}
        </div>
      </Dialog>
    </div>
  );
}

/** "22 matches · saved 14:05 · 365 hidden": the deck's one line under the title. */
function MetaLine({ deckReady, matches, savedAt, starter, hidden, onHidden }: { deckReady: boolean; matches: number; savedAt: number | null; starter: boolean; hidden: number; onHidden: () => void }) {
  if (!deckReady) return <p className="text-body text-ink-2">Finding jobs in Ireland that fit you.</p>;
  const today = savedAt != null && new Date(savedAt).toDateString() === new Date().toDateString();
  const time = savedAt != null ? (today ? savedOn(savedAt, true)?.split(", ")[1] : savedOn(savedAt)) : null;
  const stale = isStale(savedAt);
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-body text-ink-2">
      <span>
        <RollingNumber value={matches} className="font-medium text-ink" /> {matches === 1 ? "match" : "matches"}
      </span>
      {time && (
        <>
          <span aria-hidden>·</span>
          <span className={stale ? "text-warn" : undefined}>
            {starter ? "starter jobs from" : "saved"} <span className="num">{time}</span>
            {stale && ", some may have closed"}
          </span>
        </>
      )}
      {hidden > 0 && (
        <>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={onHidden}
            aria-haspopup="dialog"
            className="-mx-1.5 inline-flex min-h-8 items-center rounded-pill px-1.5 text-ink underline decoration-control-border underline-offset-4 hover:bg-sunken hover:decoration-ink pointer-coarse:min-h-11"
          >
            <RollingNumber value={hidden} />
            &nbsp;hidden
          </button>
        </>
      )}
    </p>
  );
}

/** The empty deck's line types itself out, calmly, once. Screen readers get the whole line at once. */
function TypeLine({ text }: { text: string }) {
  const { reduce } = useMotion();
  const [n, setN] = useState(reduce ? text.length : 0);
  useEffect(() => {
    if (reduce) return;
    const timer = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(timer), x) : x + 1)), 34);
    return () => clearInterval(timer);
  }, [text, reduce]);
  const shown = reduce ? text.length : n;
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.slice(0, shown)}
        {shown < text.length && <span className="-mr-[3px] inline-block h-[0.85em] w-[3px] translate-y-[0.1em] bg-ink" />}
        <span className="invisible">{text.slice(shown)}</span>
      </span>
    </>
  );
}
