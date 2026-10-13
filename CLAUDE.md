@AGENTS.md

# Deis

*Deis* (said "desh") is Irish for "opportunity". A swipe-to-apply job app for early-career people in Ireland: jobs filtered for your level, languages and right to work, and a CV tailored by open-weight Gemma for each one you swipe right on. Every CV line points to a fact you confirmed. Your model, your laptop, about €0 an application. €9 once for the signed app; the code is AGPL-3.0.

Entry for the **DEV Hacktoberfest Open-Source AI Challenge, Week 2: Side Hustle** (DEV event 80, tag `#hf26challenge`): build something with open AI that someone would pay for. Solo build by Muhammad Murtuza Hussain. Same family as the author's earlier entries Pīzhù, Return Route and Droichead, but a new project: patterns reused, not code.

- **Deadline:** Sun 18 Oct 2026 23:59 PDT = **Mon 19 Oct 07:59 Irish time** (MLH's copy shows a day earlier; aim for Sunday evening).
- **Plan / PRD:** `docs/PRD.md`.
- **Prize categories in view:** Gemma, Render (featured), SerpApi, Sentry Agent Tracing, Mastra. One win per challenge. Decided against: Tinker (no fine-tune, can't tune Gemma), TabPFN (Python runtime), MongoDB/Tiger/Backboard (break local-first), ElevenLabs. DigitalOcean only if it becomes the demo's second Gemma host and a guide ships.
- **The author is the first user.** Private context (their own CVs, tailoring brief) is in `CLAUDE.local.md`, which is gitignored. Never commit personal data.

## Working rules

- Run `pnpm test`, `pnpm lint` and `npx tsc --noEmit` before each commit; `pnpm build` when config, deps or server code change.
- Copy: plain words, sentence case, no em dashes in the UI, no exclamation marks, Irish/British English. CV date ranges keep the en dash ("Apr 2025 – Present"), as in the author's own CVs.
- Never commit `.env.local` (AI Studio and SerpApi keys). `SERPAPI_MONTHLY_BUDGET=60` locally because the key is shared with other projects.
- Editing a server file while testing in the browser triggers a dev reload that drops the URL hash and interrupts in-page work. Finish a browser test before editing.

## Commands

```bash
pnpm dev                                  # http://localhost:3200 (launch config "deis" in ../.claude/launch.json)
pnpm test                                 # vitest
npx tsx scripts/api-smoke.mts ollama rahul "graduate.*data"   # feed → card → fit → kit through the running server
npx tsx scripts/smoke.mts ollama aoife    # same pipeline without the server
DEIS_DEBUG=1 npx tsx scripts/card-raw.mts openai   # print raw model output when JSON fails
npx tsx scripts/try-feed.mts <google-jobs.json> early,stretch   # what the filters decide on live boards
```

Local Gemma: `ollama pull gemma4:e4b` (6.6 GB). `.env.local` points the demo's fallback at Ollama's OpenAI endpoint so the AI Studio → second-host failover is exercised locally.

## The core invariant: Gemma judges, code guarantees

- **Which jobs you see is code** (`src/lib/jobs/`): seniority from titles and a years regex with the quoted evidence (`seniority.ts`), right to work (`rightToWork.ts`), languages (`languages.ts`), Republic of Ireland only (`normalise.ts`), ranking (`rank.ts`). Gemma only writes the three "why" lines, and only for the next three cards.
- **Every CV line cites confirmed facts** (`src/lib/cv/guard.ts`), checked sentence by sentence. Dropped: uncited or unknown facts, numbers/tools/certificates not in the cited facts, total years of experience, the never-claim list, bullets under the wrong employer, first person on a CV, "currently studying" a finished degree, and **any visa / stamp / sponsorship / right-to-work claim** (`WORK_STATUS`). Letters and answers may quote the posting's dates and name its tools only in a sentence admitting the gap.
- **Code owns** the header, employers, job titles, dates and education (`compose.ts`), and right to work on the fit screen (`WorkLine`).
- **Postings are untrusted** (`sanitize.ts`): hidden and AI-addressed text is removed before Gemma reads it and shown to the user on the card. Real postings (Tines) carry such text.
- Every guard event is shown on the kit's Checks tab and reported to Sentry by rule name only.

## Architecture

- Next.js 16 app (`output: standalone`), one client app at `/` with hash routes (`src/lib/client/store.tsx`). Data lives in IndexedDB (Dexie, `src/lib/client/db.ts`); no accounts. The model choice rides in the `x-deis-ai` header (`src/lib/ai/settings.ts`).
- **Models** (`src/mastra/model.ts`): per-request Mastra model chain. Ollama (`think: false`), user's AI Studio key, any OpenAI-compatible server (`reasoning_effort: "none"` for thinking models, or Gemma 4 thinks until the tokens run out and answers nothing), or the hosted demo key. Cloud calls have deadlines (45 s light, 120 s careful). The demo probes AI Studio and asks the fallback host first while it's failing.
- **Agents and workflow:** one Mastra agent per task (`src/mastra/agents.ts`); the kit is a workflow `cv ‖ letter ‖ answers → assemble` (`src/mastra/workflows/kit.ts`). Calls go through `structured()` in `src/mastra/gemma.ts` (native JSON first, prompt-injected schema retry, Sentry spans).
- **Job feed** (`src/lib/server/feed.ts`): 30 Greenhouse/Ashby boards (`registry.ts`, 6 h cache) plus one shared Google Jobs search per role family (SerpApi, 48 h cache, monthly budget). `gl=ie` is rejected by the Google Jobs engine; location alone works.
- **Quick lane** kits build in the background one at a time (`src/components/KitQueue.tsx`); **Careful lane** asks gap questions and turns answers into proposed facts (`Coach` in `ApplicationScreen.tsx`).

## Learned the hard way (13 Oct)

- AI Studio's Gemma 4 (26B and 31B) returned 500s for hours; some requests hung past 90 s. Gemini on the same key worked. Hence deadlines, the probe and the fallback chain.
- Output schemas with tight `.max()` limits threw away good answers (a 170-character requirement failed the whole fit). Schemas are generous; code trims.
- Models cite ids as `[ab5]`, inline in text, or copy the whole fact line; `cleanId` takes the first token.
- Gemma 26B wrote "currently undertaking an MSc" about a 2025 degree and "eligible to work in Ireland without sponsorship" for a Stamp 1G persona. Both are now code-checked.
- A `useEffect(() => register(fly))` arrow returned the function, React treated it as cleanup and flew a card every render. Effects that call registration functions need a block body.

## Progress (13 Oct)

- Repo public: github.com/MuhammadMurtuzaHussain/deis (AGPL-3.0), pushed to `main` as we go.
- Whole app works locally and in the packaged macOS app: check-in, profile import (CV, LinkedIn PDF, LinkedIn export ZIP), deck over real Irish jobs, Quick and Careful lanes, kit with sources and Checks tab, Word/PDF, tracker, settings, licence (off until Polar is set).
- Evals in `eval/RESULTS.md`: seniority 98.1% on a blind held-out set (first run), 0 jobs wrongly hidden after the fix; guard on Gemma 4 E4B removes 4% of sentences, all real over-claims, 0 untraceable left.
- Installers for macOS, Windows and Linux build in GitHub Actions (`Desktop installers`, run by hand). Only the macOS one has been run on a real machine.
- DEV post draft: `../deis-dev-post.md` (outside the repo), with TODOs for the author's own lines, first users, demo link and video.

## Open items

- [ ] Render blueprint (author's account), then set secrets: AI Studio key, SerpApi key, DigitalOcean key and model, Sentry DSN.
- [ ] DigitalOcean serverless inference as the demo's second Gemma host: confirm the model id with the key (`GET https://inference.do-ai.run/v1/models`).
- [ ] Sentry project `deis`: DSN into Render; screenshots of a kit trace and guard issues for the post.
- [ ] Polar: €9 product with a licence-key benefit; put the organisation id and checkout link in `desktop/config.json`.
- [ ] First users (the author, Cybersecurity Society), video, screenshots, DevRelay session, publish the post.
- [ ] Windows and Linux installers tested on real machines; code signing before a real launch.
