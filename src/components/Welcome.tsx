"use client";

import { ArrowRight, CloudArrowUp, DownloadSimple, GithubLogo, HardDrives, Key, Laptop } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useState } from "react";
import type { PrivacyWhere } from "@/lib/client/model";
import { routeHref, useStore } from "@/lib/client/store";
import { PERSONAS, type PersonaId } from "@/lib/demo/personas";
import { AutoDeck } from "./onboarding/AutoDeck";
import { StoryScroll } from "./onboarding/StoryScroll";
import { Credit } from "./Credit";
import { LinkedInLink } from "./SocialLink";
import { LaunchVideo } from "./LaunchVideo";
import { OfferNote } from "./OfferNote";
import { buttonClass, Button, CompanyMark, Dialog, MOTION, Pill, useMotion, Wordmark } from "./ui";

// The first screen, and the landing page of the web demo (v3). A split hero: the promise and
// two ways in on the left, the real deck card on the right with one CV line traced and
// highlighted. Then two sections laid out differently (the trace, then where the model runs),
// the price line and the source link. On the hosted demo the two demo profiles are the way
// in (PRD-15): the check-in is slow for someone who only wants to see what Deis does.

const SOURCE_URL = "https://github.com/MuhammadMurtuzaHussain/deis";
const IDS = Object.keys(PERSONAS) as PersonaId[];

/** "MSc Data Analytics graduate, on Stamp 1G, Galway": who each demo person is, in one line. */
function personaLine(id: PersonaId): string {
  const p = PERSONAS[id];
  const edu = p.facts.find((f) => f.kind === "education")?.text.split(",")[0] ?? "Graduate";
  const status = p.preferences.workStatus === "stamp1g" ? "on Stamp 1G" : "EU citizen";
  return `${edu} graduate, ${status}, ${p.preferences.cities[0]}`;
}

const firstName = (id: PersonaId) => PERSONAS[id].header.name.split(" ")[0];

const MODELS: { where: PrivacyWhere; Icon: typeof Laptop; name: string; text: string }[] = [
  { where: "this computer", Icon: Laptop, name: "Gemma on this computer", text: "Runs through Ollama. Works offline, and your facts never leave the laptop." },
  { where: "google", Icon: Key, name: "Your Google AI Studio key", text: "Google's free tier runs Gemma for you. The posting and your facts go to Google." },
  { where: "your server", Icon: HardDrives, name: "Your own server", text: "Any OpenAI-compatible server you run or trust, at home or at work." },
];

/** The headline's words slide up out of a mask, 60 ms apart. Reduced motion: a plain fade. */
function MaskWords({ text }: { text: string }) {
  const { reduce } = useMotion();
  const words = text.split(" ");
  if (reduce) return <>{text}</>;
  return (
    <>
      {words.map((w, i) => (
        <span key={i}>
          <span className="-mb-[0.14em] inline-block overflow-hidden pb-[0.14em] align-bottom">
            <motion.span className="inline-block" initial={{ y: "112%" }} animate={{ y: "0%" }} transition={{ type: "spring", stiffness: 260, damping: 30, delay: 0.08 + i * 0.06 }}>
              {w}
            </motion.span>
          </span>
          {i < words.length - 1 && " "}
        </span>
      ))}
    </>
  );
}

export function Welcome() {
  const { status, effectiveModel } = useStore();
  const { reduce, t } = useMotion();
  const [demoOpen, setDemoOpen] = useState(false);
  const hosted = Boolean(status?.hosted);
  const privacy = effectiveModel.privacy;

  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-8">
      <header className="flex h-16 items-center">
        <Wordmark />
      </header>

      <main>
        <section className="grid items-center gap-12 pt-6 pb-16 md:pt-10 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-16 lg:pb-24">
          <div className="max-w-[560px]">
            <h1 data-page-title tabIndex={-1} className="display text-[48px] leading-[1.0] text-ink sm:text-[56px] lg:text-[64px]">
              <MaskWords text="Jobs you can actually get." />
            </h1>
            <p className="mt-6 max-w-[42ch] text-lead text-ink-2">Early-career roles in Ireland that fit your level and right to work, with a CV traced to your own facts.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              {hosted ? (
                <>
                  {IDS.map((id, i) => (
                    <a key={id} href={routeHref({ name: "demo", persona: id })} className={buttonClass(i === 0 ? "primary" : "secondary", "lg")}>
                      Try as {firstName(id)}
                      {i === 0 && <ArrowRight size={18} weight="bold" aria-hidden />}
                      <span className="sr-only">, {personaLine(id)}</span>
                    </a>
                  ))}
                </>
              ) : (
                <>
                  <a href={routeHref({ name: "checkin" })} className={buttonClass("primary", "lg")}>
                    Start
                    <ArrowRight size={18} weight="bold" aria-hidden />
                  </a>
                  <Button size="lg" onClick={() => setDemoOpen(true)}>
                    Try a demo
                  </Button>
                </>
              )}
            </div>
            {hosted && (
              <>
                <a href="/download" className="link mt-5 inline-flex min-h-11 items-center gap-2 text-body font-medium">
                  <DownloadSimple size={18} weight="bold" aria-hidden />
                  Get the app for Mac, Windows or Linux
                </a>
                <p className="mt-3 flex max-w-[48ch] items-start gap-2 rounded-panel bg-accent-soft px-4 py-3 text-body text-ink">
                  <Laptop size={18} aria-hidden className="mt-0.5 shrink-0" />
                  <span>
                    <span className="font-semibold">For the best results, run Gemma on your own computer.</span> The demo&apos;s Gemma is shared by everyone, so it can hit its limit.{" "}
                    <a href="/download#gemma" className="underline underline-offset-2">
                      Set it up in three steps
                    </a>
                    .
                  </span>
                </p>
              </>
            )}
          </div>

          <motion.figure
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={t({ ...MOTION.spring, delay: 0.25 })}
            aria-label="A sample deck playing itself: each job it applies to adds a traced line to the CV"
            className="mx-auto w-full max-w-[440px] lg:mx-0"
          >
            <AutoDeck />
          </motion.figure>
        </section>

        {hosted && (
          <section aria-labelledby="w-film" className="grid gap-8 border-t border-line py-16 lg:py-20">
            <h2 id="w-film" className="display text-[32px] leading-[1.05] text-ink sm:text-page">
              See it in a minute
            </h2>
            <LaunchVideo />
          </section>
        )}

        <section aria-labelledby="w-trace" className="border-t border-line">
          <StoryScroll headingId="w-trace" />
        </section>

        <section aria-labelledby="w-model" className="grid gap-10 border-t border-line py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 lg:py-24">
          <div>
            <h2 id="w-model" className="display text-[32px] leading-[1.05] text-ink sm:text-page">
              Your model, your laptop
            </h2>
            <p className="mt-4 max-w-[44ch] text-lead text-ink-2">Deis writes with open-weight Gemma. Run it yourself and an application costs about €0.</p>
            <p className="mt-6 flex max-w-[48ch] items-start gap-3 text-body text-ink-2">
              {privacy.where === "this computer" ? <Laptop size={20} aria-hidden className="mt-0.5 shrink-0 text-ink" /> : <CloudArrowUp size={20} aria-hidden className="mt-0.5 shrink-0 text-ink" />}
              <span>
                <span className="font-semibold text-ink">Right now: {privacy.badge}.</span> {privacy.sentence}
              </span>
            </p>
          </div>
          <ol className="grid divide-y divide-line border-y border-line">
            {MODELS.map((m) => (
              <li key={m.where} className="grid grid-cols-[44px_1fr] items-start gap-4 py-6">
                <span aria-hidden className="grid size-11 place-items-center rounded-full bg-sunken text-ink">
                  <m.Icon size={20} weight="bold" />
                </span>
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-lead font-semibold text-ink">
                    {m.name}
                    {privacy.where === m.where && <Pill>In use</Pill>}
                  </p>
                  <p className="mt-1 max-w-[52ch] text-body text-ink-2">{m.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="w-price" className="border-t border-line py-16 lg:py-20">
          <h2 id="w-price" className="sr-only">
            Price
          </h2>
          <p className="max-w-[40ch] text-lead text-ink-2">
            <span className="display mr-2 text-[40px] leading-none text-ink">€9.99 once</span>
            for the desktop app, after a 14-day trial. The code is free under AGPL-3.0.
          </p>
          <OfferNote className="mt-4" />
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
            {hosted && (
              <a href="/download" className="link inline-flex min-h-11 items-center gap-2 text-body font-medium">
                <DownloadSimple size={18} aria-hidden />
                Download for Mac, Windows or Linux
              </a>
            )}
            {hosted && (
              <a href="/download#buy" className="link inline-flex min-h-11 items-center gap-2 text-body font-medium">
                Buy the app, €9.99 once
              </a>
            )}
            <a href={SOURCE_URL} target="_blank" rel="noreferrer noopener" className="link inline-flex min-h-11 items-center gap-2 text-body font-medium">
              <GithubLogo size={18} aria-hidden />
              Read the source code
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <LinkedInLink size={18} label="Follow Deis on LinkedIn" underline={false} className="link text-body font-medium" />
            {hosted && (
              <a href="/download" className="link inline-flex min-h-11 items-center text-body">
                Get the app to use your own details
              </a>
            )}
          </div>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-line py-8 text-caption text-ink-3">
        <p>
          <span lang="ga" className="font-semibold text-ink-2">
            Deis
          </span>{" "}
          (said &ldquo;desh&rdquo;) is Irish for opportunity.
        </p>
        <Credit />
      </footer>

      <Dialog open={demoOpen} onClose={() => setDemoOpen(false)} title="Try Deis as someone else" description="Two fictional graduates, real Irish jobs. Nothing you do here touches your own profile.">
        <div className="grid gap-2.5">
          {IDS.map((id) => (
            <a
              key={id}
              href={routeHref({ name: "demo", persona: id })}
              onClick={() => setDemoOpen(false)}
              className="grid grid-cols-[40px_1fr_auto] items-center gap-3 rounded-panel border border-control-border bg-surface p-4 text-left transition-[background-color,border-color,transform] hover:border-ink hover:bg-sunken active:scale-[0.99]"
            >
              <CompanyMark name={PERSONAS[id].header.name} />
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{PERSONAS[id].header.name}</span>
                <span className="block text-caption text-ink-2">
                  {personaLine(id)}. Looking in {PERSONAS[id].preferences.cities.join(", ")}.
                </span>
              </span>
              <ArrowRight size={18} weight="bold" aria-hidden className="text-ink-2" />
            </a>
          ))}
        </div>
      </Dialog>
    </div>
  );
}
