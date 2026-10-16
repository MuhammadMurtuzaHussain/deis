"use client";

import { Cards, CloudSlash, Gear, GithubLogo, IdentificationCard, Laptop, ListChecks, Cloud, LockSimple, WifiSlash } from "@phosphor-icons/react";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { db } from "@/lib/client/db";
import { enterDemo, exitDemo, isPersona } from "@/lib/client/demo";
import { modelPill } from "@/lib/client/model";
import { offlineBanner } from "@/lib/client/offline";
import { isOnboarded, routeHref, StoreProvider, useStore, type Route } from "@/lib/client/store";
import { useRouteFocus } from "@/lib/client/useRouteFocus";
import { ApiError } from "@/lib/client/api";
import { PERSONAS, type PersonaId } from "@/lib/demo/personas";
import { ApplicationScreen } from "./ApplicationScreen";
import { CheckIn } from "./CheckIn";
import { Deck } from "./Deck";
import { ErrorBoundary } from "./ErrorBoundary";
import { KitQueue } from "./KitQueue";
import { LicenceScreen } from "./Licence";
import { ModelSetup } from "./ModelSetup";
import { ProfileScreen } from "./ProfileScreen";
import { Settings } from "./Settings";
import { Tracker } from "./Tracker";
import { Button, EYEBROW, PageHeader, Toaster, toast, Wordmark } from "./ui";
import { Welcome } from "./Welcome";

// The app shell: a sticky sidebar on desktop, a bottom nav on phones, and the bars that
// apply everywhere (demo, licence, offline). Route changes scroll to the top, focus the
// page's h1 and set the document title (useRouteFocus). See docs/DESIGN.md "Shell".

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

const NAV: { route: Route; label: string; icon: typeof Cards }[] = [
  { route: { name: "deck" }, label: "Jobs", icon: Cards },
  { route: { name: "tracker" }, label: "Applications", icon: ListChecks },
  { route: { name: "profile" }, label: "Profile", icon: IdentificationCard },
  { route: { name: "settings" }, label: "Settings", icon: Gear },
];

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
  const { route, profile, licence, setLicence, locked } = useStore();
  const mainRef = useRef<HTMLElement>(null);
  const r: Route | null = profile ? (route ?? (isOnboarded(profile) ? { name: "deck" } : { name: "welcome" })) : null;
  // A locked licence is read-only (OFF-9): anything that leads to new kits shows the licence screen.
  const shown: Route | null = r && locked && ["deck", "welcome", "checkin"].includes(r.name) ? { name: "licence" } : r;
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
          <PageHeader eyebrow={EYEBROW.licence} title="Licence" description="This copy of Deis doesn't need a licence key. The desktop app asks for one after its 14-day trial." />
        );
      break;
  }

  const active = shown.name === "application" ? "tracker" : shown.name;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <button
        type="button"
        onClick={() => mainRef.current?.focus()}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:inline-flex focus:h-11 focus:items-center focus:rounded-control focus:bg-raised focus:px-4 focus:shadow-lift"
      >
        Skip to content
      </button>
      <Sidebar active={active} />

      <div className="min-w-0 pb-(--mobile-nav)">
        <DemoBar />
        {locked && <LicenceBar />}
        <OfflineBanner />
        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-[1200px] px-4 py-6 outline-none sm:px-8 lg:py-10">
          <div key={key} className="route-fade">
            <ErrorBoundary resetKey={key}>{screen}</ErrorBoundary>
          </div>
        </main>
      </div>

      <MobileNav active={active} />
    </div>
  );
}

function Sidebar({ active }: { active: string }) {
  const ready = useLiveQuery(() => db.applications.where("status").equals("ready").filter((a) => Boolean(a.kit)).count(), [], 0);
  return (
    <aside className="hidden border-r border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between lg:overflow-y-auto lg:px-4 lg:py-6">
      <div>
        <a href={routeHref({ name: "deck" })} className="block rounded-control px-3 py-1">
          <Wordmark />
          <span className="sr-only">, jobs</span>
        </a>
        <nav aria-label="Main" className="mt-8 grid gap-1">
          {NAV.map(({ route: to, label, icon: Icon }) => {
            const on = active === to.name;
            return (
              <a
                key={label}
                href={routeHref(to)}
                aria-current={on ? "page" : undefined}
                className={`relative flex h-11 items-center gap-3 rounded-control px-3 text-body transition-colors ${on ? "bg-wash font-bold text-ink" : "text-ink-2 hover:bg-wash hover:text-ink"}`}
              >
                <span aria-hidden className={`absolute top-2 bottom-2 left-0 w-[3px] rounded-full ${on ? "bg-accent" : "bg-transparent"}`} />
                <Icon size={20} weight={on ? "fill" : "regular"} aria-hidden />
                {label}
                {to.name === "tracker" && ready > 0 && (
                  <span className="num ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent-soft px-1.5 text-caption font-bold text-accent-text">
                    {ready}
                    <span className="sr-only"> ready</span>
                  </span>
                )}
              </a>
            );
          })}
        </nav>
      </div>
      <div className="grid gap-3">
        <ModelPill />
        <a href={SOURCE_URL} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-caption text-ink-2 hover:bg-wash hover:text-ink">
          <GithubLogo size={16} aria-hidden />
          <span className="underline underline-offset-2">Source code</span> (AGPL-3.0)
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </aside>
  );
}

/** Which model answers, from effectiveModel. Doubles as the offline indicator. */
function ModelPill() {
  const { effectiveModel: m, isOffline } = useStore();
  const Icon = isOffline ? CloudSlash : m.privacy.where === "this computer" ? Laptop : Cloud;
  return (
    <a href={routeHref({ name: "model" })} className="group block rounded-control border border-line bg-raised px-3 py-2.5 hover:border-control-border">
      <span className="block text-caption text-ink-3">AI model</span>
      <span className="mt-0.5 flex items-start gap-2 text-body text-ink">
        <Icon size={18} aria-hidden className={`mt-0.5 shrink-0 ${isOffline ? "text-ochre" : "text-ink-2"}`} />
        <span className="min-w-0">{modelPill(m, isOffline)}</span>
      </span>
      {!m.usable && m.reason && <span className="mt-1 block text-caption text-brick">{m.reason}</span>}
      <span className="sr-only">. Change the model</span>
    </a>
  );
}

function MobileNav({ active }: { active: string }) {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      {NAV.map(({ route: to, label, icon: Icon }) => {
        const on = active === to.name;
        return (
          <a key={label} href={routeHref(to)} aria-current={on ? "page" : undefined} className={`relative flex h-16 flex-col items-center justify-center gap-1 text-caption ${on ? "font-bold text-ink" : "text-ink-2"}`}>
            <span aria-hidden className={`absolute inset-x-6 top-0 h-[3px] rounded-b-full ${on ? "bg-accent" : "bg-transparent"}`} />
            <Icon size={22} weight={on ? "fill" : "regular"} aria-hidden />
            {label}
          </a>
        );
      })}
    </nav>
  );
}

/** One line in trace-soft: who you're trying Deis as, and the way out. */
function DemoBar() {
  const { demo } = useStore();
  if (!demo || !isPersona(demo)) return null;
  const p = PERSONAS[demo as PersonaId];
  return (
    <div className="border-b border-line bg-trace-soft">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 py-1.5 sm:px-8">
        <p className="min-w-0 truncate text-caption text-ink sm:text-body">
          <span className="sm:hidden">
            Demo: <strong>{p.header.name}</strong>, fictional
          </span>
          <span className="hidden sm:inline">
            You&apos;re trying Deis as <strong>{p.header.name}</strong>, a fictional graduate. Your own profile is set aside until you leave.
          </span>
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 text-ink underline underline-offset-2"
          onClick={async () => {
            await exitDemo();
            location.hash = routeHref({ name: "welcome" });
          }}
        >
          Leave the demo
        </Button>
      </div>
    </div>
  );
}

/** Read-only lock: shown on every screen while the trial has ended. */
function LicenceBar() {
  return (
    <div className="border-b border-line bg-ochre-soft">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-body sm:px-8">
        <LockSimple size={18} weight="fill" aria-hidden className="shrink-0 text-ochre" />
        <p className="min-w-0 flex-1">Your free trial has ended. Deis is read-only: you can still read, export and change settings, but not build new kits.</p>
        <a href={routeHref({ name: "licence" })} className="link font-medium">
          Buy or enter a key
        </a>
      </div>
    </div>
  );
}

/** The app-wide offline banner (offlineBanner() decides the words). */
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
  return (
    <div className={`border-b border-line ${banner.tone === "warn" ? "bg-ochre-soft" : "bg-wash"}`}>
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-body sm:px-8">
        <Icon size={18} aria-hidden className={`shrink-0 ${banner.tone === "warn" ? "text-ochre" : "text-ink-2"}`} />
        <p role="status" className="min-w-0 flex-1">
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
    </div>
  );
}
