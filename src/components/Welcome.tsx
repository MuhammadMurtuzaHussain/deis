"use client";

import { ArrowRight, HardDrives, ShieldCheck } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { enterDemo } from "@/lib/client/demo";
import { useStore } from "@/lib/client/store";
import { PERSONAS, type PersonaId } from "@/lib/demo/personas";
import { score } from "@/lib/jobs/normalise";
import { Wordmark } from "./App";
import { JobCard } from "./JobCard";
import { Button, Dialog } from "./ui";

// The first screen, and the landing page of the web demo. One message, one real
// card (the actual component, with a sample posting), two ways in.

const SAMPLE = score(
  {
    id: "sample",
    source: "pasted",
    title: "Graduate Data Analyst",
    company: "Corrib Health",
    location: "Galway, Ireland",
    city: "Galway",
    remote: true,
    postedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    description: "Our graduate programme is open to recent graduates. You must have the right to work in Ireland.",
    salary: "€34,000 to €38,000",
    apply: [],
    url: "https://example.ie",
  },
  [],
);

const SAMPLE_WHY = {
  jobId: "sample",
  at: 0,
  score: 78,
  why: [
    { kind: "strong" as const, text: "Built Power BI dashboards on delivery times for 5 managers", facts: [] },
    { kind: "transferable" as const, text: "MSc thesis forecasting footfall in Python carries over", facts: [] },
    { kind: "gap" as const, text: "No healthcare data experience shown yet", facts: [] },
  ],
};

export function Welcome() {
  const { go } = useStore();
  const reduce = useReducedMotion();
  const [demoOpen, setDemoOpen] = useState(false);

  const startDemo = async (id: PersonaId) => {
    await enterDemo(id);
    setDemoOpen(false);
    go({ name: "deck" });
  };

  return (
    <main className="mx-auto max-w-[1120px] px-4 sm:px-8">
      <header className="flex h-20 items-center">
        <Wordmark />
      </header>

      <section className="grid items-center gap-12 py-8 md:grid-cols-[1.1fr_1fr] md:py-16">
        <div>
          <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-balance md:text-6xl">Jobs you can actually get.</h1>
          <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-ink-2">
            Early-career roles in Ireland, filtered for your level and visa. A tailored CV for each, written by open-weight Gemma.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="primary" size="lg" onClick={() => go({ name: "checkin" })}>
              Start the check-in
              <ArrowRight size={18} aria-hidden />
            </Button>
            <Button size="lg" onClick={() => setDemoOpen(true)}>
              Try a demo profile
            </Button>
          </div>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16, rotate: 1.5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
          className="relative mx-auto w-full max-w-md"
        >
          <div aria-hidden className="absolute inset-x-6 -bottom-3 top-3 rounded-card border border-line bg-surface-2" />
          <div className="relative">
            <JobCard job={SAMPLE} work="ok" why={SAMPLE_WHY} preview />
          </div>
          <p className="mt-6 text-center text-sm text-ink-3">A sample card. Swipe right and Deis tailors your CV to it.</p>
        </motion.div>
      </section>

      <section className="grid gap-10 border-t border-line py-14 md:grid-cols-2">
        <div className="flex gap-4">
          <ShieldCheck size={28} className="shrink-0 text-accent" aria-hidden />
          <div>
            <h2 className="text-xl font-bold">It can&apos;t make things up about you</h2>
            <p className="mt-2 max-w-[52ch] text-ink-2">
              Every line on your CV points to something you told Deis. Numbers, tools and certificates it can&apos;t trace get removed before you see them, and you can check the source of any line.
            </p>
          </div>
        </div>
        <div className="flex gap-4">
          <HardDrives size={28} className="shrink-0 text-accent" aria-hidden />
          <div>
            <h2 className="text-xl font-bold">Your model, your laptop, about €0 an application</h2>
            <p className="mt-2 max-w-[52ch] text-ink-2">
              Run Gemma on your own computer, or use a free Google AI Studio key. Pay-per-application tools often charge 30 cents to a euro each. Your profile never leaves your device.
            </p>
          </div>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-line py-8 text-sm text-ink-3">
        <p>Open source under AGPL-3.0. Built in Galway for the DEV Hacktoberfest challenge.</p>
        <a className="underline underline-offset-2 hover:text-ink" href="https://github.com/MuhammadMurtuzaHussain/deis" target="_blank" rel="noreferrer">
          Source code
        </a>
      </footer>

      <Dialog open={demoOpen} onClose={() => setDemoOpen(false)} title="Try Deis as someone else">
        <p className="text-ink-2">Two fictional graduates. Real Irish jobs. Nothing you do here touches your own profile.</p>
        <div className="mt-5 grid gap-3">
          {(Object.keys(PERSONAS) as PersonaId[]).map((id) => {
            const p = PERSONAS[id];
            const edu = p.facts.find((f) => f.kind === "education")!;
            return (
              <button key={id} type="button" onClick={() => startDemo(id)} className="rounded-surface border border-line bg-surface p-4 text-left transition hover:border-accent active:translate-y-px">
                <span className="block font-bold">{p.header.name}</span>
                <span className="mt-1 block text-sm text-ink-2">
                  {edu.text}. {p.preferences.workStatus === "stamp1g" ? "On Stamp 1G, " : ""}
                  looking in {p.preferences.cities.join(", ")}.
                </span>
              </button>
            );
          })}
        </div>
      </Dialog>
    </main>
  );
}
