"use client";

import { Cards, Gear, IdentificationCard, ListChecks } from "@phosphor-icons/react";
import { useLiveQuery } from "dexie-react-hooks";
import type { ReactNode } from "react";
import { tierOf } from "@/lib/ai/settings";
import { db } from "@/lib/client/db";
import { exitDemo } from "@/lib/client/demo";
import { isOnboarded, routeHref, StoreProvider, useStore, type Route } from "@/lib/client/store";
import { PERSONAS, type PersonaId } from "@/lib/demo/personas";
import { ApplicationScreen } from "./ApplicationScreen";
import { CheckIn } from "./CheckIn";
import { Deck } from "./Deck";
import { KitQueue } from "./KitQueue";
import { ModelSetup } from "./ModelSetup";
import { ProfileScreen } from "./ProfileScreen";
import { Settings } from "./Settings";
import { Tracker } from "./Tracker";
import { Button } from "./ui";
import { Welcome } from "./Welcome";

export default function App() {
  return (
    <StoreProvider>
      <KitQueue>
        <Shell />
      </KitQueue>
    </StoreProvider>
  );
}

export function Wordmark({ large }: { large?: boolean }) {
  // The Irish road-sign convention: the Irish word in italics, the English beside it in capitals.
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className={`ga ${large ? "text-5xl" : "text-2xl"}`}>Deis</span>
      <span className={`uppercase tracking-[0.14em] text-ink-3 ${large ? "text-sm" : "text-[11px]"}`}>Opportunity</span>
    </span>
  );
}

const NAV: { route: Route; label: string; icon: typeof Cards }[] = [
  { route: { name: "deck" }, label: "Jobs", icon: Cards },
  { route: { name: "tracker" }, label: "Applications", icon: ListChecks },
  { route: { name: "profile" }, label: "Profile", icon: IdentificationCard },
  { route: { name: "settings" }, label: "Settings", icon: Gear },
];

function Shell() {
  const { route, profile, ai, status, demo, go } = useStore();
  const ready = useLiveQuery(() => db.applications.where("status").equals("ready").count(), [], 0);

  if (!profile) {
    return (
      <main className="mx-auto grid min-h-[100dvh] max-w-md place-items-center px-6" aria-busy="true">
        <Wordmark large />
      </main>
    );
  }

  const r: Route = route ?? (isOnboarded(profile) ? { name: "deck" } : { name: "welcome" });
  if (r.name === "welcome") return <Welcome />;
  if (r.name === "checkin") return <CheckIn />;

  const active = r.name === "application" ? "tracker" : r.name;
  const modelLabel = !ai ? (status?.hosted ? "Demo Gemma" : "Not set up") : ai.provider === "demo" ? "Demo Gemma" : tierOf(ai) === "local" ? "Gemma on this computer" : ai.provider === "google" ? "Gemma on AI Studio" : "Your own server";

  let screen: ReactNode;
  switch (r.name) {
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
      screen = <ModelSetup onDone={() => go({ name: isOnboarded(profile) ? "deck" : "profile" })} />;
      break;
    case "application":
      screen = <ApplicationScreen id={r.id} />;
      break;
  }

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[232px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2">
        Skip to content
      </a>
      <aside className="hidden border-r border-line lg:flex lg:min-h-[100dvh] lg:flex-col lg:justify-between lg:px-4 lg:py-6">
        <div>
          <a href={routeHref({ name: "deck" })} className="block px-3" aria-label="Deis, jobs">
            <Wordmark />
          </a>
          <nav aria-label="Main" className="mt-8 grid gap-1">
            {NAV.map(({ route: to, label, icon: Icon }) => (
              <a
                key={label}
                href={routeHref(to)}
                aria-current={active === to.name ? "page" : undefined}
                className={`flex h-11 items-center gap-3 rounded-control px-3 text-[15px] ${active === to.name ? "bg-surface-2 font-bold text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
              >
                <Icon size={20} weight={active === to.name ? "fill" : "regular"} />
                {label}
                {to.name === "tracker" && ready > 0 && <span className="num ml-auto text-sm text-accent-text">{ready}</span>}
              </a>
            ))}
          </nav>
        </div>
        <a href={routeHref({ name: "model" })} className="rounded-control px-3 py-2 text-sm text-ink-2 hover:bg-surface-2">
          <span className="block text-ink-3">AI model</span>
          {modelLabel}
        </a>
      </aside>

      <div className="pb-24 lg:pb-0">
        {demo && <DemoBar persona={demo as PersonaId} />}
        <main id="main" className="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-8 lg:py-10">
          {screen}
        </main>
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface lg:hidden">
        {NAV.map(({ route: to, label, icon: Icon }) => (
          <a key={label} href={routeHref(to)} aria-current={active === to.name ? "page" : undefined} className={`flex h-16 flex-col items-center justify-center gap-1 text-xs ${active === to.name ? "font-bold text-ink" : "text-ink-2"}`}>
            <Icon size={22} weight={active === to.name ? "fill" : "regular"} />
            {label}
          </a>
        ))}
      </nav>
    </div>
  );
}

function DemoBar({ persona }: { persona: PersonaId }) {
  const { go } = useStore();
  const p = PERSONAS[persona];
  return (
    <div className="border-b border-line bg-accent-soft">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-8">
        <p className="text-sm">
          You&apos;re trying Deis as <strong>{p.header.name}</strong>, a fictional graduate. Your own profile is set aside until you leave.
        </p>
        <Button
          size="sm"
          onClick={async () => {
            await exitDemo();
            go({ name: "welcome" });
          }}
        >
          Leave the demo
        </Button>
      </div>
    </div>
  );
}
