@AGENTS.md

# Deis

*Deis* (said "desh") is Irish for "opportunity". A swipe-to-apply job app for early-career people in Ireland: jobs filtered for your level, languages and right to work, and a CV tailored by open-weight Gemma for each one you swipe right on. Every CV line points to a fact you confirmed. Your model, your laptop, about €0 an application. €9.99 once for the signed app; the code is AGPL-3.0.

Entry for the **DEV Hacktoberfest Open-Source AI Challenge, Week 2: Side Hustle** (DEV event 80, tag `#hf26challenge`): build something with open AI that someone would pay for. Solo build by Muhammad Murtuza Hussain. Same family as the author's earlier entries Pīzhù, Return Route and Droichead, but a new project: patterns reused, not code.

- **Deadline:** Sun 18 Oct 2026 23:59 PDT = **Mon 19 Oct 07:59 Irish time** (MLH's copy shows a day earlier; aim for Sunday evening).
- **Plan / PRD:** `docs/PRD.md`.
- **Prize categories in view:** Gemma, Render (featured), SerpApi, Sentry Agent Tracing, Mastra. One win per challenge. Decided against: Tinker (no fine-tune, can't tune Gemma), TabPFN (Python runtime), MongoDB/Tiger/Backboard (break local-first), ElevenLabs, DigitalOcean (dropped 16 Oct: OpenRouter is the demo's second Gemma host).
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
- **Models** (`src/mastra/model.ts`): per-request Mastra model chain. Ollama (`think: false`), user's AI Studio key, any OpenAI-compatible server (`reasoning_effort: "none"` for thinking models, or Gemma 4 thinks until the tokens run out and answers nothing), or the hosted demo key. Cloud calls have deadlines per host (40 s light, 100 s careful and writing) and per call (80 s, 180 s). The demo tries AI Studio, then `FALLBACK_*`, then `FALLBACK_2_*`, with no retries; a host that fails goes to the back for 2 minutes. `*_REASONING=omit` for a host that rejects `reasoning_effort`. Local calls run one at a time, `num_ctx` 16384; the `writing` effort uses `kitModel` ("Better writing", gemma4:12b) when set.
- **Agents and workflow:** one Mastra agent per task (`src/mastra/agents.ts`); the kit is a workflow `cv ‖ letter ‖ answers → assemble` (`src/mastra/workflows/kit.ts`). Calls go through `structured()` in `src/mastra/gemma.ts` (native JSON first, prompt-injected schema retry, Sentry spans).
- **Job feed** (`src/lib/server/feed.ts`): 30 Greenhouse/Ashby boards (`registry.ts`, fresh 6 h, kept 7 days, stale-while-revalidate) plus one shared Google Jobs search per role family (SerpApi, fresh 48 h, kept 14 days, daily and monthly budgets and a floor). A failed refresh never wipes the deck: no empty list is saved after an error, and nothing reachable with nothing saved is a 503. `gl=ie` is rejected by the Google Jobs engine; location alone works.
- **Offline mode** (`src/lib/server/net.ts`): `DEIS_OFFLINE=1`, `--offline` or File > Work offline. An egress guard refuses every non-loopback socket; cloud models are refused with a message pointing at Gemma on this computer. `npx tsx scripts/feed-snapshot.mts` writes `public/starter-jobs.json` (`--out <file>` elsewhere); the app doesn't read it yet.
- **Quick lane** kits build in the background one at a time (`src/components/KitQueue.tsx`); **Careful lane** asks gap questions and turns answers into proposed facts (`Coach` in `ApplicationScreen.tsx`).

## Learned the hard way (13 Oct)

- AI Studio's Gemma 4 (26B and 31B) returned 500s for hours; some requests hung past 90 s. Gemini on the same key worked. Hence deadlines, the probe and the fallback chain. Later that day 26B answered 4 of 5 one-word prompts (29–52 s each) and 31B 2 of 5, so with no second host the demo retries 26B rather than falling back to 31B. (16 Oct: the demo no longer retries; 31B is only used when no fallback host is set.)
- AI Studio's Gemma 4 takes thinking level `minimal` or `high` only (`low`/`medium` are a 400), and its JSON mode refuses bigger schemas ("invalid argument" with 16 fit requirements, fine with 6). So Gemma on AI Studio gets `minimal` and the schema in the prompt first, like local models. The free tier also caps 31B at 16,000 input tokens a minute; a kit's three parallel calls can hit it.
- Output schemas with tight `.max()` limits threw away good answers (a 170-character requirement failed the whole fit). Schemas are generous; code trims.
- Models cite ids as `[ab5]`, inline in text, or copy the whole fact line; `cleanId` takes the first token.
- Gemma 26B wrote "currently undertaking an MSc" about a 2025 degree and "eligible to work in Ireland without sponsorship" for a Stamp 1G persona. Both are now code-checked.
- A `useEffect(() => register(fly))` arrow returned the function, React treated it as cleanup and flew a card every render. Effects that call registration functions need a block body.

## Progress (16 Oct)

- Repo public: github.com/MuhammadMurtuzaHussain/deis (AGPL-3.0), pushed to `main` as we go. CI (`ci.yml`) runs tests, lint and types on every push.
- Hosted demo: https://deiscareers.tech (custom domain on Render; `www` redirects to it). Render's own address, https://deis-bu83.onrender.com, still serves it: installers up to v0.1.1 read their job feed and Buy link from there, and the cross-site check accepts both. Installers built before 13 Oct 17:15 point at the wrong host.
- Whole app works locally and in the packaged macOS app: check-in, profile import (CV, LinkedIn PDF, LinkedIn export ZIP), deck over real Irish jobs, Quick and Careful lanes, kit with sources and Checks tab, Word/PDF, tracker, settings, licence (off until Polar is set).
- Audit fixes done: per-route and demo-wide rate limits on the demo key (`limits.ts`, counts in Key Value), CI, model chain v2 (AI Studio, then `FALLBACK_*` = OpenRouter Gemma 4 26B, then optional `FALLBACK_2_*`; no retries, a failing host goes to the back for 2 minutes).
- Offline mode done: `DEIS_OFFLINE`, egress guard, File/Settings > Work offline, saved jobs in Dexie, paste-a-job (`AddJob.tsx`) that works with no network.
- Guard improvements; see `eval/RESULTS.md`. 17 Oct: CVs follow the author's hand-tailored layout (professional summary ending in a career objective, 7 "Label: sentence" competencies, 3 to 5 bullets for the main jobs, projects, education, skills, achievements copied word for word), with a one-page option in Settings. Quick/Careful lives at the top of Jobs.
- v3 "Highlighter" UI: lime highlighter, physical deck with spotlight and fly-to-tab, the kit that writes itself, trace connectors, rolling numbers, magnetic buttons, company marks (`docs/DESIGN.md`).
- Evals in `eval/RESULTS.md`: seniority 98.1% on a blind held-out set (first run), 0 jobs wrongly hidden after the fix; guard re-run on the current code 16 Oct (see the table), 0 untraceable left.
- Installers for macOS, Windows and Linux build in GitHub Actions (`Desktop installers`, run by hand). Only the macOS one has been run on a real machine.
- v0.1.4 (16 Oct) adds a signed Android APK (Capacitor shell over deiscareers.tech) and a PWA manifest for iPhone's Add to Home Screen. The APK has run on an emulator in CI, not yet on a real phone.
- October offer (`src/lib/offer.ts`, `OfferNote`): 80% off with code HACKTOBERFEST beside every price until 1 Nov. The code must exist in Polar; checkout applies it only if the Polar token has `discounts:read`.
- DEV post draft: `../deis-dev-post.md` (outside the repo). Remaining TODOs are author-only: own words, tester quotes, video link, screenshots.

## Open items

- [x] Web service on Starter (16 Oct, dashboard and `render.yaml`).
- [ ] Render blueprint applied and secrets set in the dashboard (author): AI Studio key, SerpApi key, Sentry auth token, OpenRouter `FALLBACK_API_KEY` (key with a credit limit). Key Value is on the paid `256mb` plan ($10/month from the $50 hackathon credit); web service Starter $7/month.
- [ ] Sentry screenshots of a kit trace and guard issues for the post (project `deis`, org `tfc-research-and-innovation-li`).
- [x] Polar: €9.99 product and checkout link in `desktop/config.json`.
- [ ] Polar (author): create the HACKTOBERFEST 80% discount, ending 31 Oct.
- [ ] Testers (author): the author's own job search, Cybersecurity Society; quotes for the post. Then video, screenshots, DevRelay session, publish.
- [ ] Job feed expansion to about 250 jobs (another agent); put the real count in README and the post.
- [ ] Windows and Linux installers tested on real machines; code signing before a real launch.
