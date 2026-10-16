"use client";

import { ArrowRight, CloudArrowUp, Coins, GithubLogo, Laptop } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useState } from "react";
import { routeHref, useStore } from "@/lib/client/store";
import { PERSONAS, type PersonaId } from "@/lib/demo/personas";
import { Beat, SampleCard, SampleFit, SampleTrace } from "./onboarding/Story";
import { buttonClass, Button, Dialog, EYEBROW, MOTION, useMotion, Wordmark } from "./ui";

// The first screen, and the landing page of the web demo. One message, a sample index
// card, a three-beat story (card, fit, traced CV), honest privacy copy for this mode and
// a price line. On the hosted demo the two demo profiles are the way in (PRD-15): the
// check-in is slow for someone who only wants to see what Deis does.

const SOURCE_URL = "https://github.com/MuhammadMurtuzaHussain/deis";
const IDS = Object.keys(PERSONAS) as PersonaId[];

/** "MSc Data Analytics graduate, Stamp 1G, Galway": who each demo person is, in one line. */
function personaLine(id: PersonaId): string {
  const p = PERSONAS[id];
  const edu = p.facts.find((f) => f.kind === "education")?.text.split(",")[0] ?? "Graduate";
  const status = p.preferences.workStatus === "stamp1g" ? "on Stamp 1G" : "EU citizen";
  return `${edu} graduate, ${status}, ${p.preferences.cities[0]}`;
}

/** A link to #/demo/<id>: the shell loads the persona and opens the deck. */
function PersonaLink({ id, primary }: { id: PersonaId; primary?: boolean }) {
  const p = PERSONAS[id];
  return (
    <a href={routeHref({ name: "demo", persona: id })} className={`${buttonClass(primary ? "primary" : "secondary", "lg")} h-auto min-h-14 flex-col items-start gap-0.5 py-2.5 text-left whitespace-normal`}>
      <span className="inline-flex items-center gap-2 font-bold">
        Try as {p.header.name.split(" ")[0]}
        <ArrowRight size={18} aria-hidden />
      </span>
      <span className={`text-caption font-normal ${primary ? "text-accent-ink/90" : "text-ink-2"}`}>{personaLine(id)}</span>
    </a>
  );
}

export function Welcome() {
  const { status, effectiveModel } = useStore();
  const { reduce, t } = useMotion();
  const [demoOpen, setDemoOpen] = useState(false);
  const hosted = Boolean(status?.hosted);
  const privacy = effectiveModel.privacy;
  const local = privacy.where === "this computer";

  return (
    <main className="mx-auto max-w-[1120px] px-4 sm:px-8">
      <header className="flex h-20 items-center justify-between gap-4">
        <Wordmark />
        <a href={SOURCE_URL} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-caption text-ink-2 hover:text-ink">
          <GithubLogo size={18} aria-hidden />
          <span className="link">Source code</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </header>

      <section className="grid items-center gap-12 py-8 md:grid-cols-[1.1fr_1fr] md:py-14">
        <div>
          <p aria-hidden="true" lang="ga" className="eyebrow mb-2">
            {EYEBROW.welcome}
          </p>
          <h1 data-page-title tabIndex={-1} className="display text-hero text-ink text-balance md:text-[56px]">
            Jobs you can actually get.
          </h1>
          <p className="mt-5 max-w-[46ch] text-lead text-ink-2">Early-career roles in Ireland, filtered for your level and right to work. A tailored CV for each, written by open-weight Gemma, with every line traced to something you told it.</p>

          {hosted ? (
            <div className="mt-8 grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {IDS.map((id, i) => (
                  <PersonaLink key={id} id={id} primary={i === 0} />
                ))}
              </div>
              <p className="text-body text-ink-2">
                Two fictional graduates, real Irish jobs.{" "}
                <a href={routeHref({ name: "checkin" })} className="link">
                  Or start with your own details
                </a>
              </p>
            </div>
          ) : (
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={routeHref({ name: "checkin" })} className={buttonClass("primary", "lg")}>
                Start the check-in
                <ArrowRight size={18} aria-hidden />
              </a>
              <Button size="lg" onClick={() => setDemoOpen(true)}>
                Try a demo profile
              </Button>
            </div>
          )}

          <div className="mt-6 flex max-w-[52ch] items-start gap-3 text-body text-ink-2">
            {local ? <Laptop size={20} aria-hidden className="mt-0.5 shrink-0 text-ink" /> : <CloudArrowUp size={20} aria-hidden className="mt-0.5 shrink-0 text-ink" />}
            <p>
              <span className="font-bold text-ink">{privacy.badge}.</span> {privacy.sentence}
            </p>
          </div>
        </div>

        {/* The back card sits inside the same box as the front one, so it can't paint over the caption (UX-X3). */}
        <motion.figure
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, rotate: 1.5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={t(MOTION.spring)}
          className="mx-auto grid w-full max-w-md gap-5"
        >
          <div className="relative">
            <div aria-hidden className="absolute inset-x-6 top-3 -bottom-3 rounded-card border border-line bg-surface" />
            <div className="relative">
              <SampleCard />
            </div>
          </div>
          <figcaption className="text-center text-caption text-ink-2">A sample card. Swipe right and Deis tailors your CV to it.</figcaption>
        </motion.figure>
      </section>

      <section aria-labelledby="how" className="border-t border-line py-12 md:py-16">
        <h2 id="how" className="display text-title text-ink sm:text-page">
          From a card to a CV you can stand over
        </h2>
        <ol className="mt-8 grid gap-10 md:grid-cols-3 md:gap-8">
          <Beat n={1} title="A card you can trust" picture={<SampleCard compact />}>
            Code reads the level and right to work from the posting and quotes it. Gemma only says how you match.
          </Beat>
          <Beat n={2} title="An honest fit" picture={<SampleFit />}>
            Each must-have is matched to your facts, or named as a gap so you can answer it.
          </Beat>
          <Beat n={3} title="Every line traced" picture={<SampleTrace />}>
            Every CV line points to something you told Deis. Anything it can&apos;t trace is removed before you see it.
          </Beat>
        </ol>
      </section>

      <section aria-labelledby="cost" className="grid gap-8 border-t border-line py-12 md:grid-cols-2">
        <div className="flex gap-4">
          <Coins size={28} className="shrink-0 text-ink" aria-hidden />
          <div>
            <h2 id="cost" className="text-lead font-bold text-ink">
              Your model, about €0 an application
            </h2>
            <p className="mt-2 max-w-[52ch] text-body text-ink-2">
              Run Gemma on your own computer, or use a free Google AI Studio key. Pay-per-application tools often charge 30 cents to a euro each.
            </p>
          </div>
        </div>
        <div className="grid content-start gap-2">
          <p className="display text-title text-ink">
            <span className="num">€9</span> once, after a 14-day trial
          </p>
          <p className="max-w-[52ch] text-body text-ink-2">
            That&apos;s the desktop app: signed, updated, with the daily Irish job feed. The source code is free under AGPL-3.0, so you can build and run it yourself.
          </p>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-line py-8 text-caption text-ink-2">
        <p>Open source under AGPL-3.0. Built in Galway for the DEV Hacktoberfest challenge.</p>
        <a className="link inline-flex min-h-11 items-center" href={SOURCE_URL} target="_blank" rel="noreferrer noopener">
          Source code
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </footer>

      <Dialog open={demoOpen} onClose={() => setDemoOpen(false)} title="Try Deis as someone else" description="Two fictional graduates. Real Irish jobs. Nothing you do here touches your own profile.">
        <div className="grid gap-3">
          {IDS.map((id) => (
            <a
              key={id}
              href={routeHref({ name: "demo", persona: id })}
              onClick={() => setDemoOpen(false)}
              className="grid gap-1 rounded-surface border border-control-border bg-raised p-4 text-left transition hover:bg-wash active:translate-y-px"
            >
              <span className="font-bold text-ink">{PERSONAS[id].header.name}</span>
              <span className="text-caption text-ink-2">
                {personaLine(id)}. Looking in {PERSONAS[id].preferences.cities.join(", ")}.
              </span>
            </a>
          ))}
        </div>
      </Dialog>
    </main>
  );
}
