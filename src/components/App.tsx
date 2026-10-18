"use client";

import { Cards, CloudSlash, DownloadSimple, Gear, GithubLogo, IdentificationCard, ListChecks, LockSimple, WifiSlash } from "@phosphor-icons/react";
import { LayoutGroup, motion } from "motion/react";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { db } from "@/lib/client/db";
import { enterDemo, exitDemo, isPersona } from "@/lib/client/demo";
import { modelPill, type EffectiveModel } from "@/lib/client/model";
import { offlineBanner } from "@/lib/client/offline";
import { isOnboarded, routeHref, StoreProvider, useStore, type Route } from "@/lib/client/store";
import { useRouteFocus } from "@/lib/client/useRouteFocus";
import { ApiError } from "@/lib/client/api";
import { PERSONAS, type PersonaId } from "@/lib/demo/personas";
import { ApplicationScreen } from "./ApplicationScreen";
import { CheckIn } from "./CheckIn";
import { Credit } from "./Credit";
import { Deck } from "./Deck";
import { LaneSwitch } from "./deck/LaneSwitch";
import { ErrorBoundary } from "./ErrorBoundary";
import { KitQueue } from "./KitQueue";
import { LicenceScreen } from "./Licence";
import { DemoModelBanner } from "./LocalGemma";
import { ModelSetup } from "./ModelSetup";
import { ProfileScreen } from "./ProfileScreen";
import { Settings } from "./Settings";
import { Tracker } from "./Tracker";
import { Button, MOTION, PageHeader, RollingNumber, Toaster, toast, useArrivalPulse, useMotion, Wordmark } from "./ui";
import { Welcome } from "./Welcome";

// The app shell, v3: a sticky 64px top bar on desktop (wordmark, segmented pill nav, demo
// pill, model status pill, settings), a bottom tab bar on phones (the top keeps the wordmark
// and the model pill), and slim inline notices under the top bar (licence lock, offline).
// Route changes scroll to the top, focus the page's h1 and set the document title
// (useRouteFocus). See docs/DESIGN.md "Shell".

export { Wordmark };

const SOURCE_URL = "https://github.com/MuhammadMurtuzaHussain/deis";

export default function App() {
  return (
    <StoreProvider>
      <KitQueue>
        <Shell />
        <Toaster />
      </KitQueue>
    </StoreProvider>
  );
}

/** The segmented nav on desktop. Settings is the gear button beside the model pill. */
const NAV: { route: Route; label: string; icon: typeof Cards }[] = [
  { route: { name: "deck" }, label: "Jobs", icon: Cards },
  { route: { name: "tracker" }, label: "Applications", icon: ListChecks },
  { route: { name: "profile" }, label: "Profile", icon: IdentificationCard },
];
/** The phone's tab bar also carries Settings. */
const TABS = [...NAV, { route: { name: "settings" } as Route, label: "Settings", icon: Gear }];

/** document.title until the screen's h1 renders. */
const TITLES: Record<Route["name"], string> = {
  welcome: "Jobs you can actually get",
  checkin: "Check-in",
  model: "AI model",
  profile: "Your profile",
  deck: "Jobs for you",
  tracker: "Applications",
  settings: "Settings",
  application: "Application",
  demo: "Demo",
  licence: "Licence",
};

function Splash({ label }: { label?: string }) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-6" aria-busy="true">
      <div className="grid justify-items-center gap-3">
        <Wordmark large />
        {label && (
          <p role="status" className="text-body text-ink-2">
            {label}
          </p>
        )}
      </div>
    </main>
  );
}

/** #/demo/aoife and #/demo/rahul: load the persona and go straight to the deck (PRD-15). */
function DemoRoute({ persona }: { persona: string }) {
  useEffect(() => {
    let gone = false;
    (async () => {
      // replace, not push: Back from the deck shouldn't load the demo again.
      if (!isPersona(persona)) return location.replace("#/welcome");
      await enterDemo(persona);
      if (!gone) location.replace("#/deck");
    })();
    return () => {
      gone = true;
    };
  }, [persona]);
  return <Splash label="Loading the demo profile…" />;
}

function Shell() {
  const { route, profile, licence, setLicence, locked, status } = useStore();
  const mainRef = useRef<HTMLElement>(null);
  const r: Route | null = profile ? (route ?? (isOnboarded(profile) ? { name: "deck" } : { name: "welcome" })) : null;
  // A locked licence is read-only (OFF-9): anything that leads to new kits shows the licence screen.
  // The web demo has no check-in: your own CV is read in the app only, so the check-in opens Welcome.
  const shown: Route | null = r && status?.hosted && r.name === "checkin" ? { name: "welcome" } : r && locked && ["deck", "welcome", "checkin"].includes(r.name) ? { name: "licence" } : r;
  const key = shown ? routeHref(shown) : "loading";
  useRouteFocus(mainRef, key, shown ? TITLES[shown.name] : "Deis");

  if (!profile || !shown) return <Splash />;
  if (shown.name === "demo") return <DemoRoute persona={shown.persona} />;
  // Welcome and the check-in are full-screen: no nav until you have a profile.
  if (shown.name === "welcome")
    return (
      <ErrorBoundary resetKey={key}>
        <Welcome />
      </ErrorBoundary>
    );
  if (shown.name === "checkin")
    return (
      <ErrorBoundary resetKey={key}>
        <CheckIn />
      </ErrorBoundary>
    );

  let screen: ReactNode;
  switch (shown.name) {
    case "deck":
      screen = <Deck />;
      break;
    case "tracker":
      screen = <Tracker />;
      break;
    case "profile":
      screen = <ProfileScreen />;
      break;
    case "settings":
      screen = <Settings />;
      break;
    case "model":
      screen = <ModelSetup onDone={() => (location.hash = routeHref({ name: isOnboarded(profile) ? "deck" : "profile" }))} />;
      break;
    case "application":
      screen = <ApplicationScreen key={shown.id} id={shown.id} />;
      break;
    case "licence":
      screen =
        licence && licence.state !== "off" ? (
          <LicenceScreen licence={licence} onChange={setLicence} />
        ) : (
          <PageHeader title="Licence" description="This copy of Deis doesn't need a licence key. The desktop app asks for one after its 14-day trial." />
        );
      break;
  }

  const active = shown.name === "application" ? "tracker" : shown.name;

  return (
    <div className="min-h-dvh pb-(--mobile-nav)">
      <button
        type="button"
        onClick={() => mainRef.current?.focus()}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:inline-flex focus:h-11 focus:items-center focus:rounded-pill focus:bg-surface focus:px-5 focus:font-medium focus:shadow-lift"
      >
        Skip to content
      </button>
      <TopBar active={active} />
      <div className="mx-auto grid w-full max-w-[1200px] gap-2 px-4 empty:hidden md:px-8 [&:not(:empty)]:pt-3">
        {locked && <LicenceBar />}
        <OfflineBanner />
        <DemoModelBanner />
      </div>
      <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-[1200px] px-4 py-6 outline-none md:px-8 lg:py-10">
        <div key={key} className="route-fade">
          <ErrorBoundary resetKey={key}>{screen}</ErrorBoundary>
        </div>
      </main>
      <footer className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-6 px-4 pb-8 md:px-8">
        <a href={SOURCE_URL} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center gap-2 text-caption text-ink-3 hover:text-ink">
          <GithubLogo size={16} aria-hidden />
          <span className="underline underline-offset-2">Source code</span> (AGPL-3.0)
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        {status && !status.desktop && (
          <a href="/download" className="inline-flex min-h-11 items-center gap-2 text-caption text-ink-3 hover:text-ink">
            <DownloadSimple size={16} aria-hidden />
            <span className="underline underline-offset-2">Desktop app</span> for Mac, Windows and Linux
          </a>
        )}
        <Credit className="py-3 sm:ml-auto" />
      </footer>
      <TabBar active={active} />
    </div>
  );
}

/** How many kits are ready to send: the mono count on Applications. */
function useReadyCount() {
  return useLiveQuery(() => db.applications.where("status").equals("ready").filter((a) => Boolean(a.kit)).count(), [], 0);
}

function TopBar({ active }: { active: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-3 px-4 md:px-8">
        <a href={routeHref({ name: "deck" })} className="-mx-2 inline-flex h-11 shrink-0 items-center rounded-pill px-2">
          <Wordmark />
          <span className="sr-only">, jobs</span>
        </a>
        <div className="hidden flex-1 justify-center lg:flex">
          <SegmentedNav active={active} />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2 lg:ml-0">
          <DemoPill />
          {active === "deck" && <LaneSwitch className="hidden lg:flex" />}
          {/* The model and Settings share one pill, the same shape as the main nav. */}
          <div className="flex min-w-0 items-center gap-0.5 rounded-pill bg-sunken p-1">
            <ModelPill />
            <a
              href={routeHref({ name: "settings" })}
              aria-current={active === "settings" ? "page" : undefined}
              className={`hidden h-8 shrink-0 items-center rounded-pill px-3 text-caption font-medium transition-colors lg:inline-flex ${active === "settings" ? "bg-ink text-surface" : "text-ink-2 hover:bg-surface hover:text-ink"}`}
            >
              Settings
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}

/** Jobs, Applications, Profile as a segmented pill; the ink indicator slides between them (layoutId). */
function SegmentedNav({ active }: { active: string }) {
  const ready = useReadyCount();
  const { t } = useMotion();
  // The deck's applied cards fly into Applications (data-fly-target), which pulses as they land.
  const pulse = useArrivalPulse<HTMLSpanElement>("applications");
  return (
    <LayoutGroup id="main-nav">
      <nav aria-label="Main" className="flex items-center gap-1 rounded-pill bg-sunken p-1">
        {NAV.map(({ route: to, label }) => {
          const on = active === to.name;
          return (
            <a key={label} href={routeHref(to)} aria-current={on ? "page" : undefined} className={`relative inline-flex h-9 items-center gap-2 rounded-pill px-4 text-body font-medium transition-colors ${on ? "text-surface" : "text-ink-2 hover:text-ink"}`}>
              {on && <motion.span aria-hidden layoutId="nav-indicator" transition={t(MOTION.indicator)} className="absolute inset-0 rounded-pill bg-ink" />}
              <span ref={to.name === "tracker" ? pulse : undefined} data-fly-target={to.name === "tracker" ? "applications" : undefined} className="relative inline-flex items-center gap-2">
                {label}
                {to.name === "tracker" && ready > 0 && (
                  <span className={`relative font-mono text-[12px] ${on ? "text-surface/80" : "text-ink-3"}`}>
                    <RollingNumber value={ready} from={0} />
                    <span className="sr-only"> ready</span>
                  </span>
                )}
              </span>
            </a>
          );
        })}
      </nav>
    </LayoutGroup>
  );
}

/** The phone's bottom tab bar: icons and labels; the active tab gets an ink pill behind its icon. */
function TabBar({ active }: { active: string }) {
  const ready = useReadyCount();
  const { t } = useMotion();
  const pulse = useArrivalPulse<HTMLSpanElement>("applications");
  return (
    <LayoutGroup id="tab-bar">
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        {TABS.map(({ route: to, label, icon: Icon }) => {
          const on = active === to.name;
          return (
            <a key={label} href={routeHref(to)} aria-current={on ? "page" : undefined} className={`flex h-16 flex-col items-center justify-center gap-1 text-[12px] font-medium ${on ? "text-ink" : "text-ink-3"}`}>
              <span ref={to.name === "tracker" ? pulse : undefined} data-fly-target={to.name === "tracker" ? "applications" : undefined} className="relative grid h-8 w-14 place-items-center">
                {on && <motion.span aria-hidden layoutId="tab-indicator" transition={t(MOTION.indicator)} className="absolute inset-0 rounded-pill bg-ink" />}
                <Icon size={20} weight={on ? "fill" : "regular"} aria-hidden className={`relative ${on ? "text-surface" : ""}`} />
                {to.name === "tracker" && ready > 0 && (
                  <span className="absolute -top-1 right-1 z-10 inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-ink px-1 font-mono text-[10px] leading-none text-surface ring-2 ring-bg">
                    <RollingNumber value={ready} from={0} />
                    <span className="sr-only"> ready</span>
                  </span>
                )}
              </span>
              {label}
            </a>
          );
        })}
      </nav>
    </LayoutGroup>
  );
}

/** Where the model runs, in two words: "this computer", "AI Studio", "demo server". */
function modelPlace(m: EffectiveModel): string {
  if (m.privacy.where === "this computer") return "this computer";
  if (/AI Studio/.test(m.label)) return "AI Studio";
  if (/demo/i.test(m.label)) return "demo server";
  return "your server";
}

/** Which model answers, from effectiveModel: a status dot, "Gemma" and where it runs. Says "Offline" when offline. */
function ModelPill() {
  const { effectiveModel: m, isOffline, demo } = useStore();
  const broken = !m.usable;
  const dot = broken ? "bg-danger" : isOffline ? "bg-warn" : "bg-accent";
  return (
    <a
      href={routeHref({ name: "model" })}
      title={broken && m.reason ? m.reason : modelPill(m, isOffline)}
      className="inline-flex h-8 min-w-0 items-center gap-2 rounded-pill px-3 text-caption text-ink-2 transition-colors hover:bg-surface hover:text-ink pointer-coarse:h-10"
    >
      <span aria-hidden className="relative grid size-2 shrink-0 place-items-center">
        {!broken && !isOffline && <span className="absolute inset-0 rounded-full bg-accent opacity-60 motion-safe:animate-ping [animation-duration:2.4s]" />}
        <span className={`relative size-2 rounded-full ${dot}`} />
      </span>
      {/* With the demo pill beside it on a phone, the dot alone carries it. */}
      <span aria-hidden className={`truncate max-sm:max-w-[10rem] ${demo ? "max-sm:hidden" : ""}`}>
        {isOffline ? (
          <span className="font-medium text-ink">Offline</span>
        ) : (
          <>
            <span className="font-medium text-ink">Gemma</span>
            <span className="text-ink-3 lg:max-xl:hidden"> · {modelPlace(m)}</span>
          </>
        )}
      </span>
      <span className="sr-only">
        {broken && m.reason ? `. ${m.reason}` : ""}. AI model: {modelPill(m, isOffline)}. Change the model
      </span>
    </a>
  );
}

/** Demo mode as a compact pill: "Demo: Rahul · Leave". Leaving restores your own profile. */
function DemoPill() {
  const { demo } = useStore();
  const [busy, setBusy] = useState(false);
  if (!demo || !isPersona(demo)) return null;
  const p = PERSONAS[demo as PersonaId];
  const first = p.header.name.split(" ")[0];
  return (
    <div className="inline-flex h-10 shrink-0 items-center rounded-pill bg-sunken pl-4 text-caption text-ink-2 pointer-coarse:h-12" title={`You're trying Deis as ${p.header.name}, a fictional graduate. Your own profile is set aside until you leave.`}>
      <span>
        Demo: <strong className="font-semibold">{first}</strong>
        <span className="sr-only">, a fictional graduate. Your own profile is set aside until you leave.</span>
      </span>
      <span aria-hidden className="mx-1.5 text-ink-3">
        ·
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await exitDemo();
            location.hash = routeHref({ name: "welcome" });
          } finally {
            setBusy(false);
          }
        }}
        className="-my-px inline-flex h-[calc(100%+2px)] items-center rounded-pill pr-3 pl-1 font-semibold underline underline-offset-2 hover:text-ink-2 disabled:opacity-50"
      >
        Leave<span className="sr-only"> the demo</span>
      </button>
    </div>
  );
}

/** Read-only lock: shown on every screen while the trial has ended. */
function LicenceBar() {
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-panel bg-warn-soft px-4 py-2 text-body text-ink">
      <LockSimple size={18} weight="fill" aria-hidden className="shrink-0 text-warn" />
      <p className="min-w-0 flex-1">Your free trial has ended. Deis is read-only: you can still read, export and change settings, but not build new kits.</p>
      <a href={routeHref({ name: "licence" })} className="link font-medium">
        Buy or enter a key
      </a>
    </div>
  );
}

/** The app-wide offline notice, slim and inline under the top bar (offlineBanner() decides the words). */
function OfflineBanner() {
  const { offline, feedSavedAt, status, setOfflineMode } = useStore();
  const [busy, setBusy] = useState(false);
  const banner = offlineBanner(offline, feedSavedAt, { hosted: status?.hosted });
  if (!banner) return null;
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      await setOfflineMode(on);
      toast(on ? "Offline mode is on. Deis connects to nothing but this computer." : "Offline mode is off.");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "That didn't work. Try again from Settings.");
    } finally {
      setBusy(false);
    }
  };
  const Icon = offline.browserOnline ? CloudSlash : WifiSlash;
  const warn = banner.tone === "warn";
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-panel py-1.5 pr-1.5 pl-4 text-body text-ink ${warn ? "bg-warn-soft" : "bg-sunken"}`}>
      <Icon size={18} aria-hidden className={`shrink-0 ${warn ? "text-warn" : "text-ink-2"}`} />
      <p role="status" className="min-w-0 flex-1 py-1">
        {banner.text}
      </p>
      {banner.offerOfflineMode && status && !status.hosted && (
        <Button size="sm" variant="ghost" busy={busy} className="text-ink underline underline-offset-2" onClick={() => toggle(true)}>
          Work offline
        </Button>
      )}
      {offline.mode === "on" && (
        <Button size="sm" variant="ghost" busy={busy} className="text-ink underline underline-offset-2" onClick={() => toggle(false)}>
          Go online
        </Button>
      )}
    </div>
  );
}
