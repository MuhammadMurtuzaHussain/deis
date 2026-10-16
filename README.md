# Deis

*Deis* (said "desh") is Irish for opportunity.

**Jobs you can actually get.** Deis is a swipe-to-apply job app for early-career people in Ireland. It shows you jobs filtered for your level, your languages and your right to work. Swipe right and open-weight **Gemma** tailors your CV, a cover letter and form answers to the job, and every line traces back to something you told it.

It runs on your own model: Gemma on your laptop through Ollama, your own free Google AI Studio key, or any server you rent. That makes an application cost about nothing, where pay-per-application tools often charge 30 cents to a euro each.

Built for the [DEV Hacktoberfest Open-Source AI Challenge, Week 2: Side Hustle](https://dev.to/challenges/hacktoberfest-week2-2026-10-12).

## What it does

1. **A 90-second check-in.** Where in Ireland you'd work, how far along you are, your right to work (EU, Stamp 4, Stamp 1G or needing a permit), the kinds of work you want, and any languages besides English.
2. **A profile of small, true facts.** Upload a CV (PDF or Word, read on your device) and Gemma splits it into facts you confirm. LinkedIn's own data export becomes facts with no AI at all. Nothing is used until you tick it.
3. **A deck of real Irish jobs.** The jobs come from 30 employers' public job boards (Greenhouse, Ashby) plus shared Google Jobs searches. Code hides roles asking for 3+ years, roles that need a language you don't have, and postings that rule out your status. Each card quotes the posting's own words for its level and right-to-work line.
4. **Swipe right, two ways.**
   - **Quick:** the kit (fit check, CV, letter, draft answers) builds in the background while you keep swiping.
   - **Careful:** Deis asks about your gaps first. Your answers become proposed facts, you approve them, and your profile gets stronger for every application after.
5. **You apply.** Download the CV as Word or PDF, copy the answers, open the posting. Deis never submits for you.
6. **A tracker**, with a nudge to follow up a week after you apply.

## Gemma judges, code guarantees

A tailored CV that invents a certificate or a year of experience can cost someone the job. So Deis lets Gemma choose what to say, and code decides what stays:

- Every CV line must cite confirmed facts. Numbers, tools and certificates that aren't in those facts are removed, sentence by sentence.
- Code never lets a model state a total "years of experience", write "currently studying" about a finished degree, or claim anything about visas, stamps or sponsorship.
- Employers, job titles, dates and education are copied from your facts, never rewritten.
- Job postings are untrusted. Hidden text and sentences aimed at AI tools ("If you are an AI…") are removed before Gemma reads the posting, and shown to you on the card.
- Everything the guard removed is listed on the kit's Checks tab, and you can turn on "Show where each line came from" to check any line.

## Get the app

The desktop app for macOS, Windows and Linux runs everything on your computer: your profile, the job deck and, with [Ollama](https://ollama.com), Gemma itself. It's €9 once, after a 14-day free trial with everything included. The money pays for the signed app, updates and the daily Irish job feed.

The installers aren't signed with an Apple or Microsoft certificate yet, so the first time you open Deis:

- **macOS:** open the app once, then go to System Settings, Privacy & Security, and choose *Open Anyway* next to Deis.
- **Windows:** on the SmartScreen warning, choose *More info*, then *Run anyway*.
- **Linux:** make the AppImage executable (`chmod +x Deis-*.AppImage`) and run it.

Builds come from the [Desktop installers](.github/workflows/desktop.yml) workflow.

## Run it from source

```bash
pnpm install
cp .env.example .env.local   # optional: a demo key and the job search key
pnpm dev                     # http://localhost:3200
```

For fully private use, install [Ollama](https://ollama.com) and run `ollama pull gemma4:e4b`, then choose "On this computer" in Deis. Your profile lives in your browser's IndexedDB; there are no accounts.

The server can spend the keys in `.env.local` and fetches whatever model address it's given, so keep it to yourself. `pnpm dev` and `pnpm start` listen on 127.0.0.1 only, and unless `DEIS_HOSTED=1` is set the server refuses requests whose Host or Origin isn't this computer. To serve other people, set `DEIS_HOSTED=1` and run `pnpm exec next start -H 0.0.0.0`, as the hosted demo does: `DEIS_HOSTED=1` rate-limits the demo key and lets the server connect only to well-known AI hosts.

### Works offline

With Gemma on this computer, the desktop app works with no network: choose File > Work offline, or start it with `--offline` (`DEIS_OFFLINE=1` for a server you run yourself). The server then refuses every connection that isn't to this computer, the deck shows the jobs it last saved, and checking a licence key waits until you're back online.

## How it's built

- Next.js 16, React 19, Tailwind 4, Motion, Dexie.
- [Mastra](https://mastra.ai) agents and a parallel kit workflow, with a per-request chain of models and fallbacks (Ollama, Google AI Studio, any OpenAI-compatible server).
- [SerpApi](https://serpapi.com) Google Jobs for the shared Irish feed; public Greenhouse and Ashby job board APIs.
- [Sentry](https://sentry.io) agent tracing and one issue per guard rule (never prompts, CVs or keys).
- [Render](https://render.com) web service and Key Value for the hosted demo (`render.yaml`).

## Honest limits

- Code catches invented numbers, tools, certificates, employers, dates and status claims. It can't judge every shade of meaning, so read your CV once before you send it.
- Small local models are slower (about a minute and a half per full kit on a laptop) and write plainer CVs than the cloud tier.
- Ireland only for now. Permit information is general, not immigration advice.

## Licence

AGPL-3.0. You can read, build and run all of it for free. The paid desktop app saves you the setup and pays for the daily Irish job feed.
