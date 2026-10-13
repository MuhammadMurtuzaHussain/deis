"use client";

import { ArrowArcLeft, ArrowClockwise, BookmarkSimple, Check, X } from "@phosphor-icons/react";
import { useLiveQuery } from "dexie-react-hooks";
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CardWhy } from "@/lib/ai/schema";
import { api, ApiError } from "@/lib/client/api";
import { db, getMeta, setMeta, type CardCache, type Swipe } from "@/lib/client/db";
import { newApplication } from "@/lib/client/kit";
import { useStore } from "@/lib/client/store";
import { categoryById } from "@/lib/jobs/categories";
import { buildDeck, HIDDEN_COPY, type DeckEntry, type HiddenReason } from "@/lib/jobs/rank";
import type { ScoredJob } from "@/lib/jobs/types";
import { JobCard } from "./JobCard";
import { useKitQueue } from "./KitQueue";
import { Button, Dialog, LinkButton, Notice } from "./ui";

// The deck. Code decides which cards you see and in what order (src/lib/jobs/rank.ts);
// Gemma only writes the "why" lines, and only for the next three cards, so the model
// never reads a job you won't see. Swipe, drag, click or use the arrow keys.

const FEED_TTL = 6 * 3600_000;
type FeedState = { jobs: ScoredJob[]; at: number } | null;
type Lane = "quick" | "careful";

const SKIP_REASONS = ["Too senior", "Wrong place", "Not my field", "Pay too low", "Company"];

function DeckLoading({ categories }: { categories: string[] }) {
  const lines = ["Reading the job boards of 30 employers in Ireland", ...categories.map((c) => `Searching Google Jobs for ${categoryById(c)?.label.toLowerCase() ?? c} roles`), "Hiding senior roles and ones that rule you out", "Ranking what's left by your profile"];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, lines.length - 1)), 1400);
    return () => clearInterval(t);
  }, [lines.length]);
  return (
    <div className="mx-auto w-full max-w-md" aria-busy="true">
      <div className="relative h-[520px]">
        <div aria-hidden className="absolute inset-x-8 top-6 bottom-0 rounded-card border border-line bg-surface-2" />
        <div aria-hidden className="absolute inset-x-4 top-3 bottom-3 rounded-card border border-line bg-surface-2" />
        <div className="absolute inset-0 bottom-6 grid content-start gap-4 rounded-card border border-line bg-surface p-6 shadow-lift">
          <div className="skeleton h-4 w-1/3" />
          <div className="skeleton h-8 w-4/5" />
          <div className="skeleton h-4 w-1/2" />
          <div className="mt-6 skeleton h-4 w-11/12" />
          <div className="skeleton h-4 w-3/4" />
        </div>
      </div>
      <p className="mt-6 text-center text-ink-2" aria-live="polite">
        {lines[i]}
      </p>
    </div>
  );
}

function SwipeCard({ entry, why, whyError, onDecide, onDetails, register }: { entry: DeckEntry; why: CardCache | null; whyError: string | null; onDecide: (dir: Swipe["dir"]) => void; onDetails: () => void; register: (fly: (dir: Swipe["dir"]) => void) => void }) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-320, 320], [-10, 10]);
  const applyOpacity = useTransform(x, [30, 130], [0, 1]);
  const skipOpacity = useTransform(x, [-130, -30], [1, 0]);
  const saveOpacity = useTransform(y, [-130, -30], [1, 0]);
  const done = useRef(false);

  const fly = useCallback(
    (dir: Swipe["dir"]) => {
      if (done.current) return;
      done.current = true;
      if (reduce) return onDecide(dir);
      const to = dir === "apply" ? { x: 640, y: 40 } : dir === "skip" ? { x: -640, y: 40 } : { x: 0, y: -720 };
      void Promise.all([animate(x, to.x, { duration: 0.28, ease: [0.4, 0, 1, 1] }), animate(y, to.y, { duration: 0.28, ease: [0.4, 0, 1, 1] })]).then(() => onDecide(dir));
    },
    [onDecide, reduce, x, y],
  );

  // A block body on purpose: returning register()'s result would hand React a "cleanup" that flies the card.
  useEffect(() => {
    register(fly);
  }, [fly, register]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    if (offset.x > 120 || velocity.x > 700) return fly("apply");
    if (offset.x < -120 || velocity.x < -700) return fly("skip");
    if (offset.y < -120 || velocity.y < -700) return fly("save");
    void animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
    void animate(y, 0, { type: "spring", stiffness: 400, damping: 30 });
  };

  return (
    <motion.div drag dragMomentum={false} onDragEnd={onDragEnd} style={{ x, y, rotate }} className="absolute inset-0 bottom-6 cursor-grab touch-none active:cursor-grabbing">
      <JobCard job={entry.job} work={entry.work} why={why} whyError={whyError} onDetails={onDetails} />
      <motion.span aria-hidden style={{ opacity: applyOpacity }} className="pointer-events-none absolute left-6 top-6 rounded-control border-2 border-accent bg-surface px-3 py-1 text-lg font-bold text-accent-text">
        Apply
      </motion.span>
      <motion.span aria-hidden style={{ opacity: skipOpacity }} className="pointer-events-none absolute right-6 top-6 rounded-control border-2 border-ink-3 bg-surface px-3 py-1 text-lg font-bold text-ink-2">
        Skip
      </motion.span>
      <motion.span aria-hidden style={{ opacity: saveOpacity }} className="pointer-events-none absolute inset-x-0 top-6 mx-auto w-fit rounded-control border-2 border-ink-3 bg-surface px-3 py-1 text-lg font-bold text-ink-2">
        Save for later
      </motion.span>
    </motion.div>
  );
}

export function Deck() {
  const { profile, go, setPreferences } = useStore();
  const queue = useKitQueue();
  const swipes = useLiveQuery(() => db.swipes.toArray(), [], null);
  const cards = useLiveQuery(() => db.cards.toArray(), [], []);
  const [feed, setFeed] = useState<FeedState>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [whyErrors, setWhyErrors] = useState<Record<string, string>>({});
  const [details, setDetails] = useState<ScoredJob | null>(null);
  const [laneAsk, setLaneAsk] = useState<ScoredJob | null>(null);
  const [lastSkip, setLastSkip] = useState<ScoredJob | null>(null);
  const [announce, setAnnounce] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [lane, setLaneState] = useState<Lane | null>(null);
  // The fly-out animation finishes after the dialog closes, so decide() reads the lane from a ref.
  const laneRef = useRef<Lane | null>(null);
  const setLane = (l: Lane | null) => {
    laneRef.current = l;
    setLaneState(l);
  };
  const [tick, setTick] = useState(0);
  const flyRef = useRef<((d: Swipe["dir"]) => void) | null>(null);
  const history = useRef<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  // Swiped cards leave the deck at once; the database catches up a moment later.
  const [gone, setGone] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    void getMeta<Lane | null>("lane", null).then((l) => {
      laneRef.current = l;
      setLaneState(l);
    });
  }, []);

  const prefs = profile?.preferences;
  const categories = useMemo(() => [...(prefs?.roles ?? [])].sort(), [prefs?.roles]);
  const feedKey = `feed:${categories.join(",")}`;

  const loadFeed = useCallback(
    async (force = false) => {
      const cached = await db.feed.get(feedKey);
      setFeedError(null);
      if (cached && !force && Date.now() - cached.at < FEED_TTL) return setFeed({ jobs: cached.jobs, at: cached.at });
      setFeed(null);
      try {
        const out = await api<{ jobs: ScoredJob[]; sources: unknown }>("/api/feed", { categories, includeSenior: false });
        await db.feed.put({ key: feedKey, jobs: out.jobs, at: Date.now(), sources: out.sources });
        setFeed({ jobs: out.jobs, at: Date.now() });
      } catch (e) {
        if (cached) setFeed({ jobs: cached.jobs, at: cached.at });
        setFeedError(e instanceof ApiError ? e.message : "Couldn't load jobs.");
      }
    },
    [categories, feedKey],
  );

  // First load: the cached feed if it's fresh, otherwise the server. Only re-runs when the searches change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await db.feed.get(feedKey);
      if (cancelled) return;
      if (cached && Date.now() - cached.at < FEED_TTL) setFeed({ jobs: cached.jobs, at: cached.at });
      else await loadFeed(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedKey]);

  const deck = useMemo(() => {
    if (!feed || !profile || !swipes) return null;
    return buildDeck(feed.jobs, profile.preferences, profile.facts, new Set([...swipes.map((s) => s.jobId), ...gone]));
  }, [feed, profile, swipes, gone]);

  const top = deck?.entries.slice(0, 3) ?? [];
  const current = top[0];
  const cardFor = (id: string) => cards.find((c) => c.jobId === id) ?? null;

  // Gemma writes the "why" lines for the next three cards, one at a time.
  const asking = useRef(false);
  useEffect(() => {
    if (!profile || asking.current) return;
    const next = top.find((e) => !cardFor(e.job.id) && !whyErrors[e.job.id]);
    if (!next) return;
    const confirmed = profile.facts.filter((f) => f.confirmed);
    if (!confirmed.length) return;
    asking.current = true;
    api<CardWhy>("/api/card", { job: next.job, facts: confirmed })
      .then((r) => db.cards.put({ jobId: next.job.id, why: r.why, score: r.score, at: Date.now() }))
      .catch((e) => setWhyErrors((m) => ({ ...m, [next.job.id]: e instanceof ApiError ? e.message : "Gemma couldn't read this one." })))
      .finally(() => {
        asking.current = false;
        setTick((t) => t + 1);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top.map((e) => e.job.id).join(","), cards.length, profile?.facts.length, whyErrors, tick]);

  const decide = useCallback(
    async (dir: Swipe["dir"]) => {
      if (!current) return;
      const job = current.job;
      setGone((g) => new Set(g).add(job.id));
      await db.swipes.put({ jobId: job.id, dir, at: Date.now(), job: dir === "save" ? job : undefined });
      history.current.push(job.id);
      setCanUndo(true);
      const next = deck?.entries[1]?.job;
      const nextText = next ? ` Next: ${next.title} at ${next.company}.` : "";
      if (dir === "skip") {
        setLastSkip(job);
        setAnnounce(`Skipped ${job.title}.${nextText}`);
      } else setLastSkip(null);
      if (dir === "save") setAnnounce(`Saved ${job.title} for later.${nextText}`);
      const lane = laneRef.current;
      if (dir === "apply" && lane) {
        if (!(await db.applications.get(job.id))) await db.applications.put(newApplication(job, lane));
        if (lane === "careful") return go({ name: "application", id: job.id });
        setToast(`Building a kit for ${job.title} at ${job.company}. Find it in Applications.`);
        setAnnounce(`Applying to ${job.title}. Kit queued.${nextText}`);
      }
    },
    [current, deck, go],
  );

  // Ask how to apply before the card leaves, so closing the question leaves the card in place.
  const act = useCallback(
    (dir: Swipe["dir"], chosen?: Lane) => {
      if (!current) return;
      if (dir === "apply" && !(chosen ?? lane)) return setLaneAsk(current.job);
      return flyRef.current ? flyRef.current(dir) : void decide(dir);
    },
    [current, decide, lane],
  );

  const undo = useCallback(async () => {
    const id = history.current.pop();
    setCanUndo(history.current.length > 0);
    if (!id) return;
    setGone((g) => {
      const n = new Set(g);
      n.delete(id);
      return n;
    });
    await db.swipes.delete(id);
    const app = await db.applications.get(id);
    if (app && !app.kit && app.status === "ready") await db.applications.delete(id);
    setLastSkip(null);
    setAnnounce("Undone.");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (details || laneAsk) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t?.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      if (e.key === "ArrowRight") act("apply");
      else if (e.key === "ArrowLeft") act("skip");
      else if (e.key === "ArrowUp") act("save");
      else if (e.key.toLowerCase() === "z" && !e.metaKey && !e.ctrlKey) void undo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, undo, details, laneAsk]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!profile || !prefs) return null;
  const noFacts = !profile.facts.some((f) => f.confirmed);
  const hiddenEntries = deck ? (Object.entries(deck.hidden) as [HiddenReason, number][]).filter(([k, n]) => n > 0 && k !== "seen") : [];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,440px)_1fr] lg:items-start lg:gap-12">
      <section aria-label="Job cards" className="mx-auto w-full max-w-md lg:mx-0">
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
        {!feed ? (
          feedError ? (
            <Notice tone="error">
              {feedError}{" "}
              <button className="underline" onClick={() => loadFeed(true)}>
                Try again
              </button>
            </Notice>
          ) : (
            <DeckLoading categories={categories} />
          )
        ) : !current ? (
          <div className="grid gap-4 rounded-card border border-line bg-surface p-8">
            <h2 className="text-2xl font-bold">That&apos;s every match for now</h2>
            <p className="text-ink-2">New jobs come in daily. Check back tomorrow, or widen your search.</p>
            <div className="flex flex-wrap gap-2">
              {!prefs.showStretch && (
                <Button variant="primary" onClick={() => setPreferences({ ...prefs, showStretch: true })}>
                  Show stretch roles too
                </Button>
              )}
              <Button onClick={() => go({ name: "checkin" })}>Change what I&apos;m looking for</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="relative h-[560px] sm:h-[540px]">
              {top[2] && <div aria-hidden className="absolute inset-x-8 bottom-0 top-6 rounded-card border border-line bg-surface-2" />}
              {top[1] && <div aria-hidden className="absolute inset-x-4 bottom-3 top-3 rounded-card border border-line bg-surface-2" />}
              <SwipeCard
                key={current.job.id}
                entry={current}
                why={cardFor(current.job.id)}
                whyError={noFacts ? "Add and confirm a few facts in Profile, and Gemma will say how you match." : (whyErrors[current.job.id] ?? null)}
                onDecide={(d) => void decide(d)}
                onDetails={() => setDetails(current.job)}
                register={(f) => {
                  flyRef.current = f;
                }}
              />
            </div>

            <div className="mt-6 grid grid-cols-4 gap-2" role="group" aria-label="Decide on this job">
              <Button onClick={() => act("skip")} aria-keyshortcuts="ArrowLeft" className="h-14">
                <X size={20} aria-hidden />
                Skip
              </Button>
              <Button onClick={() => void undo()} aria-keyshortcuts="Z" variant="ghost" className="h-14" disabled={!canUndo}>
                <ArrowArcLeft size={20} aria-hidden />
                Undo
              </Button>
              <Button onClick={() => act("save")} aria-keyshortcuts="ArrowUp" className="h-14">
                <BookmarkSimple size={20} aria-hidden />
                Save
              </Button>
              <Button onClick={() => act("apply")} aria-keyshortcuts="ArrowRight" variant="primary" className="h-14">
                <Check size={20} weight="bold" aria-hidden />
                Apply
              </Button>
            </div>
            <p className="mt-3 hidden text-center text-sm text-ink-3 sm:block">Drag the card, or use the arrow keys. Z undoes.</p>

            {lastSkip && (
              <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Why did you skip it? Optional.">
                <span className="text-sm text-ink-2">Why skip? Optional:</span>
                {SKIP_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="rounded-control border border-line px-2.5 py-1 text-sm hover:border-ink-3"
                    onClick={async () => {
                      await db.swipes.update(lastSkip.id, { reason: r });
                      setLastSkip(null);
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <aside className="grid content-start gap-6">
        <div>
          <h1 className="text-3xl font-bold">Jobs for you</h1>
          {deck && (
            <p className="mt-2 text-ink-2">
              <span className="num">{deck.entries.length}</span> {deck.entries.length === 1 ? "match" : "matches"} in Ireland, best first.
            </p>
          )}
        </div>
        {toast && <Notice tone="ok">{toast}</Notice>}
        {queue.working && <Notice>Building a kit in the background. {queue.waiting > 1 ? `${queue.waiting - 1} more after this one.` : ""}</Notice>}
        {noFacts && (
          <Notice tone="warn">
            Your profile has no confirmed facts yet, so Deis can&apos;t tailor anything.{" "}
            <button className="font-medium underline" onClick={() => go({ name: "profile" })}>
              Build your profile
            </button>
          </Notice>
        )}
        {current && current.matched.length > 0 && (
          <div>
            <h2 className="text-sm text-ink-3">Words this posting shares with your profile</h2>
            <p className="mt-1 text-ink-2">{current.matched.join(", ")}</p>
          </div>
        )}
        {hiddenEntries.length > 0 && (
          <details className="text-ink-2">
            <summary className="cursor-pointer text-ink">Deis hid {hiddenEntries.reduce((s, [, n]) => s + n, 0)} jobs for you</summary>
            <ul className="mt-2 grid gap-1 text-[15px]">
              {hiddenEntries.map(([k, n]) => (
                <li key={k}>{HIDDEN_COPY[k](n)}</li>
              ))}
            </ul>
          </details>
        )}
        {feed && (
          <p className="flex items-center gap-2 text-sm text-ink-3">
            Updated {new Date(feed.at).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" })}
            <button type="button" onClick={() => loadFeed(true)} className="inline-flex items-center gap-1 rounded-control px-2 py-1 hover:bg-surface-2 hover:text-ink">
              <ArrowClockwise size={14} aria-hidden />
              Refresh
            </button>
          </p>
        )}
      </aside>

      <Dialog open={Boolean(details)} onClose={() => setDetails(null)} title={details ? `${details.title}, ${details.company}` : ""} wide>
        {details && (
          <div className="grid gap-4">
            <p className="text-ink-2">{details.location}</p>
            <div className="max-h-[55dvh] overflow-y-auto whitespace-pre-line rounded-control bg-bg p-4 text-[15px] leading-relaxed">{details.description || "This board didn't share a description. Open the original posting."}</div>
            <div className="flex flex-wrap gap-2">
              {details.apply.slice(0, 3).map((a) => (
                <LinkButton key={a.url} href={a.url}>
                  Open on {a.label}
                </LinkButton>
              ))}
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={Boolean(laneAsk)} onClose={() => setLaneAsk(null)} title="How do you want to apply?">
        <div className="grid gap-3">
          {(
            [
              ["quick", "Quick", "Deis checks the fit and writes your CV, a letter and draft answers in the background. You keep swiping, then review and apply."],
              ["careful", "Careful", "Deis shows the fit first and asks about your gaps. What you tell it can strengthen your profile for every job after this one."],
            ] as const
          ).map(([lane, title, body]) => (
            <button
              key={lane}
              type="button"
              className="rounded-surface border border-line bg-surface p-4 text-left transition hover:border-accent active:translate-y-px"
              onClick={async () => {
                await setMeta("lane", lane);
                setLane(lane);
                setLaneAsk(null);
                act("apply", lane);
              }}
            >
              <span className="block font-bold">{title}</span>
              <span className="mt-1 block text-[15px] text-ink-2">{body}</span>
            </button>
          ))}
          <p className="text-sm text-ink-3">Deis remembers this. Change it any time in Settings, or pick Careful from any application.</p>
        </div>
      </Dialog>
    </div>
  );
}
