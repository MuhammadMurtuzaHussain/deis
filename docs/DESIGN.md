# Deis design system v3: "Highlighter"

The design system as built. It replaces v2 ("Estuary paper": cream paper, a serif, ochre, Irish eyebrows and a sidebar) entirely.

**Read:** a mobile-first consumer swipe app for anxious early-career job seekers in Ireland. Crisp and confident: Linear's precision with Hinge's single-card focus. Dials: variance 5, motion 6, density 4.

**The one idea.** Every CV line is proven by a fact you gave, so the visual language is a highlighter pen. Lime (`pop`) is the only accent. It means **go** (Apply, the primary action) and **proven** (the highlighter stroke behind traced text, the fact marker fill). Nothing else is lime. Everything else is cool monochrome.

Source of truth:
- tokens and utilities: `src/app/globals.css`;
- fonts: `src/app/layout.tsx`;
- primitives: `src/components/ui.tsx`;
- shell: `src/components/App.tsx`;
- client contracts: `src/lib/client/*`.

Use these. Don't invent parallel colours, radii, buttons or headings.

## Tokens

Light and dark switch on `prefers-color-scheme`, or on `data-theme="light|dark"` on `<html>`, which Settings saves as `deis.theme`. Every token is a Tailwind colour: `bg-surface`, `text-ink-2`, `border-control-border`, `bg-pop`, `bg-pop-soft` and so on.

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#F5F5F4` | `#0B0B0C` | The page |
| `surface` | `#FFFFFF` | `#151517` | Cards, panels, dialogs, controls |
| `sunken` | `#EDEDEC` | `#1C1C1F` | Wells, segmented tracks, hover fills, skeletons |
| `ink` | `#0E0F10` | `#F2F2F3` | Primary text; selected states (chips, nav, tabs, switches) |
| `ink-2` | `#4B4D52` | `#B4B5BA` | Secondary text |
| `ink-3` | `#6B6E74` | `#8E9096` | Tertiary text, meta, mono hints (4.6:1 on bg) |
| `line` | `#E3E3E1` | `#26272B` | Hairlines only |
| `control-border` | `#8C8F94` | `#5E6168` | Borders of inputs, chips, secondary buttons (3:1) |
| `pop` | `#C8F03C` | `#C8F03C` | **Go and proven only**: primary button, Apply, the brand square |
| `pop-ink` | `#0E0F10` | `#0E0F10` | Text on `pop`. Lime is never text on a light background |
| `pop-soft` | `#ECFBC2` | lime at 16% | The highlighter stroke, fact marker pills, the go pill |
| `warn` / `warn-soft` | `#9A5B00` / `#FFF1D6` | `#F0B45A` / `#2A2112` | Gaps, stretch, follow-up, the licence lock |
| `danger` / `danger-soft` | `#C42B1C` / `#FDE4E1` | `#FF8A7A` / `#2C1614` | Blocked, errors, destructive actions |
| `focus` | `#2E5BFF` | `#8FA8FF` | The global 2 px focus ring (automatic) |
| `scrim` | ink at 45% | black at 60% | Behind dialogs |

**Elevation.** `shadow-card` (cards, sheets) and `shadow-lift` (dragging, dialogs, toasts) are ink at low alpha in light mode. In dark mode they become a 1 px `line` ring on a lighter surface. No pure black or white page backgrounds.

**Deprecated v2 names** still resolve so unconverted screens render. Don't use them in new code:

| Old | Now |
|---|---|
| `accent`, `accent-ink`, `accent-soft` | `pop`, `pop-ink`, `pop-soft` (fills only) |
| `accent-text`, `trace` | `ink` |
| `trace-soft` | `pop-soft` |
| `ochre`, `amber` (+ `-soft`) | `warn` (+ `-soft`) |
| `brick` (+ `-soft`) | `danger` (+ `-soft`) |
| `raised` | `surface` |
| `wash`, `surface-2` | `sunken` |
| `rounded-control` (12), `rounded-surface` (20) | `rounded-pill`, `rounded-panel` |
| Pill tones `trace`, `ochre`, `brick` | `go`, `warn`, `danger` |

**Layout variables.** `--mobile-nav` is the phone tab bar's height including the safe area, `0px` from `lg` up. A sticky mobile bar sits at `bottom-(--mobile-nav)`. `--top-bar` is 4rem (the sticky top bar), for sticky offsets: `top-(--top-bar)`.

### Colour meaning, one each

- **Lime fill** (`bg-pop text-pop-ink`): the primary action and Apply. One per view.
- **Lime soft** (`pop-soft`): proven. The highlighter, fact markers, "Strong match" pills.
- **Ink**: selection. Selected chips, the nav and tab indicators, switches that are on, the check-in progress bar.
- **Warn**: gaps, stretch, follow-up. **Danger**: blocked and errors.
- **Links**: ink, underlined (`.link`). Never lime.
- **Toasts**: inverse (`ink` background, `bg` text).
- **Company marks**: a muted hue from the name, never lime.

## Shapes: one rule, used everywhere

| Radius | Utility | For |
|---|---|---|
| full | `rounded-pill` (or `rounded-full`) | Every interactive control: buttons, chips, segmented nav and tabs, inputs, selects, pills, Kbd |
| 16 | `rounded-field` | Multi-line textareas only |
| 20 | `rounded-panel` | Containers: panels, notices, dialogs, toasts, empty states |
| 28 | `rounded-card` | The swipe card |
| 12 | `rounded-mark` | Company marks |

## Type

| Face | Variable | Use |
|---|---|---|
| Bricolage Grotesque (variable, `opsz`) | `font-display`, `.display` | Page titles (28 to 36), the card's job title (30 to 34, `leading-[1.05]`), big numbers (deck and tracker counts), the Welcome hero (48 to 64, max 2 lines), dialog titles, the wordmark |
| Geist | `font-sans` (default) | All UI and body, 14 to 16. Body is 15/24; prose stays within `max-w-[65ch]` |
| Geist Mono | `font-mono` | Fact ids, trace markers, counts in tables, "n / N", keyboard hints |
| Arial | `font-paper` | The CV sheet only, so the preview matches the Word file |

- `.display` sets Bricolage at **800** with `letter-spacing: -0.03em` and optical sizing. Add `font-semibold` for the 600 cut.
- Emphasis is the same family in bold. No mixed-family emphasis, no serif, no italic display.
- Scale utilities: `text-caption` 13, `text-body` 15/1.6, `text-lead` 18, `text-title` 24, `text-page` 36, `text-hero` 56.
- `.num`: tabular figures.
- Deprecated, kept for compilation only: `eyebrow` (plain 13 px ink-3), `smallcaps` (now Geist medium 14 in ink-2, the company name style) and `.ga` (bold).

## Utilities (`globals.css`)

- **`.highlight`**: the highlighter. A `pop-soft` linear-gradient background whose `background-size` animates from `0% 100%` to `100% 100%` over 220 ms when `data-on="true"` (or a bare `data-on`). It uses `box-decoration-break: clone`, so a span that wraps draws per line. Under reduced motion it fades the colour in instead. Highlights never print.
  `<span className="highlight" data-on={selected || showSources}>Built a dashboard in Power BI</span>`
- **`.company-mark`**: the tile colour behind `CompanyMark` (`hsl(var(--mark-h) var(--mark-s) var(--mark-l))`). Use the component, not the class.
- **`.link`**, **`.skeleton`**, **`.route-fade`** (140 ms), **`.visually-hidden`**.

## Motion

Use `motion/react`. Take timings from `MOTION` in `ui.tsx` and pass them through `useMotion().t()`, which returns an instant transition under reduced motion. When `useMotion().reduce` is true, animate opacity only. Motion is motivated only: nothing loops, nothing decorates.

| What | Spec |
|---|---|
| Card enter, next card rising | `MOTION.spring` (stiffness 380, damping 32), from scale .96 and y 14, rising with drag progress |
| Card exit | `MOTION.exit`: 240 ms |
| Stamps while dragging | "APPLY" (lime fill, ink text) and "SKIP" (ink outline), Bricolage 800 at 28, rotated −10°; opacity follows drag |
| Nav and tab indicator | `MOTION.indicator` spring via `layoutId` (built into the shell and `Tabs`) |
| Highlighter | 220 ms `background-size` 0 → 100% (`.highlight`, or `MOTION.highlight`). The signature moment |
| "How you match" lines | `MOTION.stagger`: 60 ms between lines |
| Tab panels | `MOTION.tab`: 120 ms cross-fade |
| Routes | 140 ms opacity fade (the shell's `.route-fade`) |
| Toasts | `MOTION.toast` spring (built in) |

The global CSS also cuts every CSS transition and animation to near zero under `prefers-reduced-motion`.

## Primitives (`src/components/ui.tsx`)

**Buttons** (all full pill, `active:scale-[0.98]`)
- `Button`: `variant` is `primary | secondary | ghost | danger`; `size` is `sm | md | lg` (36 / 44 / 48; `sm` is 44 on touch). Primary is `pop` with `pop-ink` text; secondary is `surface` with `control-border`; ghost is text that fills `sunken` on hover; danger is a secondary with danger text. `busy` shows a spinner and disables it. Labels fit on one line.
  `<Button variant="primary" busy={saving} onClick={save}>Save</Button>`
- `buttonClass(variant, size)`: the same styles, for an `<a>` or `<label>`.
- `LinkButton`: an outside link styled as a button. Opens a new tab and says so to screen readers; `external={false}` for hash routes.
- `IconButton`: round, `size` 36, 40, 44, 48, 52, 56, 60, 64 or 72, with a required `label` (sr-only plus a tooltip). The deck: Undo 44 (ghost), Later 52 (secondary), Skip 60 (secondary), Apply 72 (primary).
  `<IconButton label="Apply" size={72} variant="primary"><Check size={30} weight="bold" /></IconButton>`
- `Spinner`: a 16 px decorative spinner.

**Choices**
- `Chip`: a pill toggle with `aria-pressed`. Selected is an ink fill, surface text and a check. Never lime.
- `Switch`: `role="switch"` with a visible label and optional help. On is ink.

**Forms**
- `Field`: label above, help and error below, wired with ids.
- `inputClass` and `selectClass` are pills (44 tall); `textareaClass` is `rounded-field` (16). `control-border`, ink on focus, danger with `aria-invalid`.

**Messages and labels**
- `Notice`: a tinted panel (radius 20) with a left icon and ink text. `tone` is `info` (surface and hairline), `warn`, `error`, `ok` or `trace` (both `pop-soft`). Optional `title` and `action`. Errors are `role="alert"`; `announce={false}` for static copy.
- `Pill` (also `Badge`): `tone` is `neutral | go | warn | danger` (go is `pop-soft` with ink text). Optional `icon`.
  `<Pill tone="warn">Stretch</Pill>`
- `Kbd`: a mono pill. `<Kbd>Z</Kbd>`.

**Structure**
- `PageHeader`: an h1 in Bricolage 800 (28 on phones, 36 from `sm`), an optional `description` and right-aligned `actions`. **No eyebrow.** The h1 carries `data-page-title` and `tabIndex={-1}` so the shell focuses it and copies it into `document.title`. One per screen.
  `<PageHeader title="Jobs for you" description="22 matches" actions={<AddJobButton />} />`
- `Section`: an `<h2>` in Geist semibold 18, optional description and actions, inside a labelled `<section>`.
- `Surface`: a panel (radius 20, `surface`). Default has a hairline; `raised` has the card shadow.

**Company mark**
- `CompanyMark`: a monogram tile of up to two initials ("Bank of Ireland" → BI, "Tines" → T; words like Ltd, Group, Ireland are skipped). `size` defaults to 40, radius 12, Bricolage bold. The background is a muted hue hashed from the name: `hsl(h 35% 88%)` light, `hsl(h 25% 22%)` dark, ink text. It's `aria-hidden`, so always put the company name beside it as text.
  `<CompanyMark name={job.company} />`, `<CompanyMark name={app.company} size={32} />`
- `companyInitials(name)` and `companyHue(name)` are exported for tests and odd layouts.

**Loading and empty**
- `Skeleton` and `PageSkeleton` (announces "Loading" once). Use them instead of a blank screen.
- `EmptyState`: an icon, a big Bricolage line (28), one sentence and **one** action.
- `Elapsed`: a ticking "12 s", `aria-hidden`. Announce only the start and the finish.

**Meters and steps**
- `Meter` and `BarList`: a label, a mono count and a decorative bar (the go tone is ink, not lime).
- `StepBar`: a segmented `role="progressbar"` in ink.

**Tabs**
- `Tabs`: the WAI-ARIA tabs pattern as a segmented pill on `sunken`. The selected tab sits on an ink pill that slides between tabs (`layoutId`), with surface text. Arrow keys move and select (wrapping), Home and End jump, roving tabindex. Panels cross-fade in 120 ms. Controlled (`value`, `onChange`) or not (`defaultValue`); `keepMounted` keeps hidden panels' state.
  `<Tabs label="Kit" value={tab} onChange={setTab} items={[{ id: "cv", label: "CV", content: <CvSheet /> }, { id: "checks", label: "Checks", badge: <span className="font-mono text-[12px]">3</span>, content: <ChecksPanel /> }]} />`

**Dialog**
- `Dialog`: a bottom sheet on phones and centred from `sm` up, radius 20. Focus is trapped; Escape and the scrim close it; the page behind doesn't scroll. `title` (Bricolage), optional `description`, `footer`; `wide` makes it 768 px.

**Toasts**
- `toast("Saved")` or `toast({ message, undo, action, duration })` from anywhere; the shell mounts `<Toaster />` once. Inverse (ink background, bg text), radius 20; bottom right on desktop, above the tab bar on phones. At most three; 5 s, or 8 s with an action; hover or focus pauses. One polite live region. `dismissToast(id)` closes one early.

**Brand**
- `Wordmark`: lowercase "deis" in Bricolage 800 and a small lime square, the only decorative lime in the app. `large` is for Welcome and the splash. Re-exported from `App.tsx`. The only Irish in the UI is the wordmark and the Welcome line explaining "deis = opportunity".

## Shell (`App.tsx`)

- **Desktop (`lg` up):** a sticky 64 px top bar on `bg/80` with backdrop blur and a bottom hairline.
  - Left: the wordmark (links to the deck).
  - Centre: a segmented pill nav (Jobs, Applications, Profile) on `sunken`; the active item sits on an ink pill that slides (`layoutId`). Applications shows the ready-kit count in mono.
  - Right: the demo pill (when a persona is loaded), the model status pill and a round settings button.
- **Phones:** the top bar keeps the wordmark, the demo pill and the model pill (glyph only beside the demo pill). A bottom tab bar (64 px plus the safe area) holds Jobs, Applications, Profile and Settings with icons and labels; the active tab gets an ink pill behind its icon. The page gets `pb-(--mobile-nav)`.
- **Model status pill:** plain text (`effectiveModel.label`) and a Phosphor glyph: Laptop (this computer), Cloud, CloudSlash in warn with "Offline", or Warning in danger when the choice isn't usable. Links to `#/model`.
- **Demo pill:** "Demo: Rahul · Leave". Leave runs `exitDemo()` and goes to Welcome.
- **Notices under the top bar:** slim inline panels inside the page width: the licence lock (warn-soft, "Buy or enter a key") and the offline notice ("No internet. Showing jobs saved on Thu 15 Oct." with "Work offline" on local runs, or "Offline mode is on." with "Go online").
- **Page container:** `max-w-[1200px] px-4 md:px-8`. A quiet "Source code (AGPL-3.0)" link closes every page.
- **Skip to content:** a button that focuses `<main id="main" tabIndex={-1}>`.
- **Route change** (`useRouteFocus`): scroll to the top, focus the page's `[data-page-title]` h1 and set `document.title` to "<h1 text> · Deis". Waits up to 1.5 s, then focuses `<main>`.
- **Errors:** each screen sits in an `ErrorBoundary` that resets on route change. `src/app/global-error.tsx` covers the root.
- **Licence lock (read-only):** when `useStore().locked`, the deck, Welcome and check-in show the licence screen; Applications, Profile, Settings, export and the model page stay usable; the KitQueue doesn't build.
- **Demo routes:** `#/demo/aoife` and `#/demo/rahul` load that persona and replace the hash with `#/deck`.

## Layout patterns

- **Page header:** `<PageHeader>` first in every screen. Primary actions go in `actions`.
- **Deck:** one centred column, 440 to 480 px wide, the card and the actions directly under it. On phones the actions are `fixed inset-x-0 bottom-(--mobile-nav)`; give the page bottom padding so nothing hides behind them.
- **Two-pane workspace** (the kit): `grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]`, the CV sheet left, the inspector right and sticky (`lg:sticky lg:top-[calc(var(--top-bar)+1.5rem)]`). Below `lg` the inspector follows the sheet.
- **CV sheet:** `font-paper`, white paper (`bg-white text-black` in both themes), 1 px line and a subtle shadow. Trace markers are small mono numbers in `pop-soft` pills in the gutter, carrying `data-trace`; print CSS hides them inside `#cv-print`. Anything else that mustn't print gets `data-print-hidden`.

## Bans (pre-flight)

- No em or en dashes in UI strings, except the CV date ranges that code owns.
- No eyebrows. No Irish over titles.
- No decorative dots, except the single brand square.
- No cream or beige, no serif.
- No lime text on light backgrounds, no lime links, badges or decoration.
- No three equal cards.
- No gradients except the lime highlighter.
- No pure `#000` or `#fff` page backgrounds.
- Every button label fits on one line.
- Copy: plain words, sentence case, Irish/British English, no exclamation marks.

## Contracts for screens

### Store (`useStore()` from `src/lib/client/store.tsx`)

| Field | Type | Notes |
|---|---|---|
| `route`, `go(route)` | `Route` | Adds `{name:"demo", persona}` and `{name:"licence"}`. `routeHref(route)` builds hrefs |
| `profile`, `setHeader`, `setPreferences`, `setNeverClaim`, `putFacts`, `removeFact` | | As before |
| `ai`, `setAi` | `AiSettings \| null` | The saved choice. `null` means requests go as provider `demo` |
| `effectiveModel` | `EffectiveModel` | What really answers. See below |
| `status`, `refreshStatus()` | `ServerStatus \| null` | `/api/status`. Refreshed on focus (at most every 60 s) and on online/offline events |
| `offline` | `{ browserOnline, mode: "off"\|"on"\|"forced", reachable? }` | `reachable` is whether the server's last internet call worked |
| `isOffline` | `boolean` | Offline mode is on, or the browser has no network. Disable "paste a link" and new fetches |
| `setOfflineMode(on)` | `Promise<mode>` | POST `/api/offline`. Throws an `ApiError` (`forced`, `not_here`) |
| `feedSavedAt` | `number \| null` | Epoch ms, live from `meta.feedSavedAt` |
| `licence`, `setLicence`, `locked` | | `locked` means read-only |
| `demo` | `string \| null` | The persona id |

The store value is memoised.

### effectiveModel (`src/lib/client/model.ts`)

`effectiveModel(ai, status)` is pure, so you can call it for each option in Settings. It returns:
- `settings` and `chosen`;
- `tier`;
- `label` (for example "Gemma on this computer", "Demo Gemma", "Gemma on AI Studio", "Your own server");
- `model`;
- `detail` (for example "gemma4:e4b through Ollama");
- `privacy: { where, badge, sentence }`, where `where` is one of `this computer`, `google`, `your server` or `deis demo server`;
- `usable` and `reason` (cloud choices in offline mode, or Ollama on the hosted demo);
- `worksOffline`;
- `standIn`: provider `demo` answered by local Gemma, because there are no demo hosts or offline mode is on.

`PRIVACY_BADGE[where]` gives the badge text. `modelPill(m, offline)` gives the model pill text. Never write "never leaves your device" by hand: use `privacy.sentence`.

### Offline helpers (`src/lib/client/offline.ts`)

- `savedOn(at, withTime?)` returns "Thu 15 Oct" or "Thu 15 Oct, 14:05".
- `isStale(savedAt)` is true after 3 days, which is when to add "some may have closed".
- `offlineBanner(state, feedSavedAt, {hosted})`.
- `isOffline(state)`.
- `offlineModeOn(state)`.

### Saved jobs and cache (`src/lib/client/db.ts`, Dexie v2)

- **`db.jobs`:** `SavedJob = ScoredJob & { savedAt }`, indexed by `savedAt` and `source`. Version 2's upgrade copies every job from the old `feed` cache and sets `feedSavedAt`. The `feed` table still exists, but read `jobs` now.
- **`saveJobs(jobs, savedAt?, { feed? })`:** keeps jobs and moves `feedSavedAt`. Pasted jobs pass `{ feed: false }`.
- **`savedJobs({ source? })`:** returns jobs newest first. `asScoredJob(row)` strips `savedAt`.
- **`feedSavedAt()`:** returns `Promise<number | null>`.
- **`pruneJobs(days = 30)`:** the store runs it once a session. It keeps jobs referenced by an application, a saved swipe or a paste.
- **Cards (CH-X1):**
  - `factsKey(profile.facts)` hashes the confirmed facts;
  - `getCard(jobId, key)` returns null on a mismatch;
  - `putCard({ ...row, factsKey })` stores a card;
  - `enterDemo` and `exitDemo` clear `db.cards`, and "Delete everything" deletes the whole database.
- **Storage:**
  - `requestPersistence()` asks for persistent storage once;
  - `exportAll()` also exports pasted jobs, and `importAll()` restores them.

### API errors (`src/lib/client/api.ts`)

`api(path, body?, { signal?, ai?, timeoutMs? })` throws `ApiError { message, code, status, kind, retryAfter? }`. A caller's own abort rethrows the `AbortError`, and `isAbort(e)` detects it.

| `kind` | From | React by |
|---|---|---|
| `offline` | Server `offline`, or the fetch fails while `navigator.onLine` is false | Pausing; resume on `online` or when offline mode turns off |
| `network` | Server `network` or `feed_unreachable`, or the fetch fails | Keeping what's on screen and retrying later |
| `timeout` | Server `model_timeout`, a 504, or the client deadline | Offering Try again |
| `rate_limited` | A 429 or `rate_limited` (see `retryAfter`) | Showing the message |
| `model` | `model_*`, `settings_rejected`, other 5xx | Showing the message, with a link to Settings |
| `bad_request` | Other 4xx | Showing the message |

- `isPausable(e)` is true for `offline` and `network`: the Quick queue pauses instead of writing `kitError`.
- Client deadlines (`deadlineFor(path, tier)`):
  - cloud: 95 s for light calls, 200 s for careful ones and 280 s for the kit;
  - local: 5, 10 and 20 minutes;
  - the feed: 75 s;
  - anything else: 30 s.

### Copy rules (for every string)

- Plain words in sentence case.
- No em dashes and no exclamation marks.
- Irish/British English.
- "Jobs saved on Thu 15 Oct" (`savedOn`), not "Updated".
- CV date ranges keep the en dash.
