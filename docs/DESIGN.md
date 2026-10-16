# Deis design system: "Estuary paper"

The design system as built. It replaces the flat green-on-grey UI of the first version. The mood is calm and editorial, like a desk with paper on it. The job card is an index card. The CV is a real sheet, with proof-reader's margin marks showing where each line came from.

Source of truth:
- tokens: `src/app/globals.css`;
- primitives: `src/components/ui.tsx`;
- shell: `src/components/App.tsx`;
- client contracts: `src/lib/client/*`.

Use these. Don't invent parallel colours, radii, buttons or headings.

## Tokens

Light and dark switch on `prefers-color-scheme`, or on `data-theme="light|dark"` on `<html>`, which Settings saves as `deis.theme`. Every token is a Tailwind colour: `bg-surface`, `text-ink-2`, `border-control-border` and so on. Every text pair is 5:1 or better.

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#F4F1EA` | `#121614` | The page (the desk) |
| `surface` | `#FFFDF8` | `#1A1F1C` | Quiet panels, the sidebar, notices |
| `raised` | `#FFFFFF` | `#202622` | Cards, sheets, dialogs, controls |
| `wash` | `#EBE6DB` | `#262D29` | Hover fills, skeletons, wells. Not a surface |
| `ink` / `ink-2` / `ink-3` | `#1A1E1C` / `#4A524E` / `#5E6661` | `#ECE8DF` / `#B8B4AA` / `#959A93` | Text: primary, secondary, tertiary |
| `line` | `#DDD6C8` | `#323A35` | Decorative hairlines only |
| `control-border` | `#878C86` | `#6E766F` | Borders of inputs, chips and secondary buttons (3:1, WCAG 1.4.11) |
| `accent` / `accent-ink` | `#0F5C45` / `#FFF` | `#6CCFA6` / `#08241A` | **Go only**: the primary action, Apply, a ready kit |
| `accent-soft` / `accent-text` | `#DCEBE3` / `#0C4A37` | `#18382B` / `#8FE0BE` | Go pills, "ready" counts |
| `trace` / `trace-soft` | `#2D5B8A` / `#E3ECF5` | `#8DB4E2` / `#1C2836` | Provenance: trace markers, fact slips, the demo bar |
| `ochre` / `ochre-soft` | `#8A5A00` / `#F7EBCF` | `#E8B55A` / `#2E2412` | Gap, stretch, follow-up, warnings, the licence bar |
| `brick` / `brick-soft` | `#A23B2A` / `#F6E0DA` | `#F2917F` / `#351C17` | Blocked, errors, destructive actions |
| `focus` | `#1B6FD1` | `#7AB4FF` | The global 3 px focus ring (automatic) |
| `scrim` | ink at 50% | black at 60% | Behind dialogs |

Deprecated aliases keep old screens rendering until they're converted: `surface-2` (now `wash`), `amber` and `amber-soft` (now `ochre`). Don't use them in new code.

**Elevation**
- `shadow-card`: cards and sheets.
- `shadow-lift`: dragging, dialogs, toasts.
- In dark mode both become a hairline plus a soft shadow.

**Radii:** `rounded-control` (10 px) for controls, `rounded-surface` (16 px) for surfaces, `rounded-card` (20 px) for the job card. Round buttons and pills are `rounded-full`. Nothing else.

**Layout variable:** `--mobile-nav` is the height of the phone's bottom nav, including the safe area. It's `0px` from `lg` up. A sticky mobile bar sits at `bottom-(--mobile-nav)`.

### Colour meanings, one each

- **Green** means go: the primary button, Apply, a ready kit, a strong-match tick. Not selection, not links, not "early career".
- **Selected chips:** an ink border plus a check. Never a green fill.
- **Links:** ink, underlined. Use the `.link` class.
- **Demo bar:** `trace-soft`.
- **"Early career":** a neutral pill.
- **Toasts:** inverse (an `ink` background with `bg`-coloured text).
- **Tabs and the check-in progress:** ink, not green.

## Type

| Utility | Size / line height | Use |
|---|---|---|
| `text-caption` | 13 / 1.45 | Meta, help text, pills, eyebrows |
| `text-body` | 15 / 1.55 | UI and body text (the page default is 16) |
| `text-lead` | 18 / 1.5 | Section headings (`<h2>`, Atkinson bold), counts |
| `text-title` | 24 / 1.2 | Page titles on mobile, card titles, dialog titles |
| `text-page` | 32 / 1.12 | Page titles from `sm` |
| `text-hero` | 44 / 1.05 | The Welcome hero (go larger with `md:text-[56px]`) |

**Faces**
- `display` (utility class): Newsreader at weight 560 with optical sizing, as `font-display`. Use it for page titles, the card title (28 px), the fit verdict, money and counts, the Welcome hero and dialog titles. Nothing else.
- `font-sans` (the default): Atkinson Hyperlegible Next. It was chosen for low vision, so keep it for all UI and body text.
- `font-mono`: Atkinson Hyperlegible Mono, for trace markers, fact ids and small tabular counters.
- `font-paper`: Arial, for the CV sheet only, so the preview matches the Word file.

**Helpers**
- `eyebrow`: 13 px italic in `ink-3`, for the Irish word over a title.
- `smallcaps`: 13 px tracked capitals, for the company on the index card.
- `.num`: tabular figures.
- `.ga`: Newsreader italic, for the Irish word "Deis" in running text.

## Irish eyebrows

Every page title has an Irish eyebrow above it: `EYEBROW` in `ui.tsx`.

| Key | Irish | English title |
|---|---|---|
| `deck` | *Poist* | Jobs for you |
| `tracker` | *Iarratais* | Applications |
| `application` | *Iarratas* | The job title |
| `profile` | *Próifíl* | Your profile |
| `settings` | *Socruithe* | Settings |
| `model` | *Samhail* | The model page |
| `licence` | *Ceadúnas* | Licence |
| `welcome` | *Fáilte* | The Welcome page |

The approach, used everywhere: the eyebrow is `aria-hidden="true"` with `lang="ga"`. Screen readers hear the English title only. `PageHeader` does this for you.

## Motion

Use `motion/react`. Take timings from `MOTION` in `ui.tsx`, and pass them through `useMotion().t()`, which returns an instant transition under reduced motion. When `useMotion().reduce` is true, animate opacity only and never transforms.

| What | Spec |
|---|---|
| Swipe exit | `MOTION.exit`: 260 ms, ease `[0.4,0,1,1]`; x to ±560 |
| Next card rising | `MOTION.spring` (stiffness 380, damping 32), from scale .96 and y 12 |
| Rubber stamps | Apply (accent), Skip (ink), Later (ochre), rotated −8°; opacity follows drag progress |
| "How you match" lines | `MOTION.stagger`: 60 ms between lines |
| Trace highlight | `MOTION.trace`: 150 ms |
| Tabs | `MOTION.tab`: 120 ms cross-fade (built into `Tabs`) |
| Routes | 160 ms fade (the shell's `.route-fade`) |
| Toasts | `MOTION.toast` spring (built in) |

The global CSS also cuts every CSS transition and animation to near zero under `prefers-reduced-motion`.

## Primitives (`src/components/ui.tsx`)

**Buttons**
- `Button`: `variant` is `primary | secondary | ghost | danger`; `size` is `sm | md | lg`. `sm` is 36 px with a mouse and 44 px on touch. `busy` shows a spinner and disables the button.
  `<Button variant="primary" busy={saving} onClick={save}>Save</Button>`
- `buttonClass(variant, size)`: the same styles, for an `<a>` or `<label>`.
- `LinkButton`: an outside link styled as a button. It opens a new tab and says so to screen readers. Pass `external={false}` for hash routes.
  `<LinkButton href={job.url} variant="primary">Open the posting</LinkButton>`
- `IconButton`: round, `size` 44, 48, 56 or 64, with a required `label` (sr-only plus a tooltip). The deck uses Skip 56, Later 48, Apply 64 and Undo 44.
  `<IconButton label="Apply" size={64} variant="primary"><Check size={28} /></IconButton>`
- `Spinner`: a 16 px decorative spinner.

**Choices**
- `Chip`: a toggle with `aria-pressed`. When selected, it gets an ink border and a check.
  `<Chip on={has(x)} onClick={() => toggle(x)}>Data</Chip>`
- `Switch`: `role="switch"` with a visible label and optional help.
  `<Switch checked={on} onChange={setOn} label="Work offline" description="Deis connects to nothing but this computer." />`

**Forms**
- `Field`: label, help and error, wired with ids. `inputClass`, `textareaClass` and `selectClass` style the controls with `control-border`, and turn brick with `aria-invalid`.
  `<Field label="Company" error={err}>{(id, d) => <input id={id} aria-describedby={d} className={inputClass} />}</Field>`

**Messages and labels**
- `Notice`: a left icon, a 3 px coloured left border and ink text. `tone` is `info | warn | error | ok | trace`. It takes optional `title` and `action`. Errors are `role="alert"`. Pass `announce={false}` for static copy that shouldn't be a live region.
  `<Notice tone="warn" title="Saved jobs" action={<Button size="sm">Refresh</Button>}>Some may have closed.</Notice>`
- `Pill` (also exported as `Badge`): `tone` is `neutral | go | trace | ochre | brick`, with an optional `icon`.
  `<Pill tone="ochre">Stretch</Pill>`
- `Kbd`: `<Kbd>Z</Kbd>`.

**Structure**
- `Surface`: paper. `raised` gives white with the card shadow. Without it, you get the quieter surface with a hairline.
  `<Surface raised className="p-6">…</Surface>`
- `PageHeader`: the Irish eyebrow, a Newsreader h1, an optional `description` and right-aligned `actions`. The h1 carries `data-page-title` and `tabIndex={-1}`, so the shell focuses it on a route change and copies its text into `document.title`. Use exactly one per screen.
  `<PageHeader eyebrow={EYEBROW.deck} title="Jobs for you" description="21 matches in Ireland" actions={<AddJobButton />} />`
- `Section`: an `<h2>` in Atkinson bold 18, plus an optional description and actions, inside a labelled `<section>`.
  `<Section title="Your data" description="…">…</Section>`

**Loading and empty**
- `Skeleton` and `PageSkeleton`: placeholders. `PageSkeleton` is a header-shaped placeholder that announces "Loading" once. Use it instead of a blank screen (UX-9).
- `EmptyState`: an icon, a display title, one sentence and **one** action.
  `<EmptyState icon={<Cards size={24} />} title="That's every match for now" action={<AddJobButton />}>Paste a job you found elsewhere.</EmptyState>`
- `Elapsed`: a ticking "12 s" that is `aria-hidden`. Never put it inside a live region. Announce only the start ("Writing your kit") and the finish.

**Meters and steps**
- `Meter`: a label, a Newsreader count and a decorative bar. The text carries the value.
- `BarList`: a `<ul>` of meters that scales to the largest value. It's for the deck's hidden-for-you reasons.
  `<BarList items={[{ key: "senior", label: "Needs 3+ years", value: 41, tone: "neutral" }, { key: "student", label: "Students only", value: 6, tone: "ochre" }]} />`
- `StepBar`: a segmented `role="progressbar"` showing "Step 2 of 5", in ink.
  `<StepBar total={5} current={2} label="Check-in progress" />`

**Tabs**
- `Tabs`: the WAI-ARIA tabs pattern. Each `items` entry is `{ id, label, content, badge?, disabled? }`.
  - Arrow keys move and select, wrapping round; Home and End jump.
  - Roving tabindex, with a 3 px ink underline on the selected tab.
  - The panel cross-fades in 120 ms.
  - It works controlled (`value` and `onChange`) or uncontrolled (`defaultValue`).
  - `keepMounted` keeps hidden panels in the DOM to preserve state, such as a half-typed note.
  `<Tabs label="Kit" value={tab} onChange={setTab} items={[{ id: "cv", label: "CV", content: <CvSheet /> }, { id: "checks", label: "Checks", badge: <Pill>3</Pill>, content: <ChecksPanel /> }]} />`

**Dialog**
- `Dialog`: a bottom sheet on phones (with a grab handle and safe-area padding) and centred from `sm` up.
  - Focus is trapped, and Escape or a click on the scrim closes it.
  - The page behind doesn't scroll, and nested dialogs only respond on the top one.
  - Props: `title` (display), optional `description` and a `footer` for the actions; `wide` makes it 768 px.
  `<Dialog open={open} onClose={close} title="Add a job" footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="add-job">Add it</Button></>}>…</Dialog>`

**Toasts**
- Call `toast("Saved")` or `toast({ message, undo, action, duration })` from anywhere, with no provider needed. The shell mounts `<Toaster />` once.
  - Toasts are inverse colours and sit above the mobile nav.
  - At most three show at once.
  - Each lasts 5 s, or 8 s with an action. Hover or focus pauses the timer, and `duration: 0` keeps a toast until it's closed.
  - `undo` adds an Undo button.
  - They're announced through one polite live region.
  - `dismissToast(id)` closes one early.
  `toast({ message: "Skipped. Graduate Data Analyst at Corrib Health.", undo: () => undoSkip(id) })`

**Brand**
- `Wordmark`: "Deis" in Newsreader italic with "OPPORTUNITY" in small tracked capitals. `large` is for Welcome. It's also re-exported from `App.tsx` for older imports.

## Layout patterns

- **Page header:** `<PageHeader>` first in every screen, with an `mb-6` or `mb-8` gap below it. Primary actions go in `actions`, top right on desktop. They wrap under the title on phones.
- **Content width:** the shell's `<main>` is `max-w-[1200px]` with `px-4 sm:px-8`. Long text stays within `max-w-[64ch]`.
- **Two-pane workspace** (the kit):
  - `grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]`.
  - The paper goes on the left, with a sticky toolbar above it (`sticky top-0 z-10 bg-bg/95 backdrop-blur`).
  - The inspector goes on the right (`lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto`).
  - Below `lg`, the inspector becomes a section under the sheet.
- **Inspector column** (deck and kit): a stack of `Surface` blocks, each with a `text-caption` label in `ink-3` (sentence case, not capitals) and its content. Counts use `display num`.
- **Sticky mobile action bar** (the deck):
  - `fixed inset-x-0 bottom-(--mobile-nav) z-20 lg:static`, on `bg-surface/95` with a top hairline.
  - Round buttons are centred.
  - Give the page `pb-28 lg:pb-0` so nothing hides behind it.
- **CV sheet:** `font-paper`, white (`bg-white text-black` in both themes, since it's paper), `shadow-card` and a 28 px trace gutter.
  - Trace markers and footnotes carry `data-trace`, and the print CSS hides them inside `#cv-print`.
  - Anything else that mustn't print gets `data-print-hidden`.

## Shell (`App.tsx`)

- **Desktop:**
  - a sticky aside 248 px wide, with the wordmark at the top;
  - nav items with a 3 px accent bar on the active one, ink bold text and a wash fill;
  - a "ready kits" count on Applications;
  - at the bottom, the model pill (from `effectiveModel`, with "· Offline" and a cloud-slash icon when offline) and the AGPL source link.
- **Phones:** a bottom nav with 4 items and a 3 px accent bar on top of the active one. The page gets `pb-(--mobile-nav)`.
- **Bars under the top edge, in order:**
  - the demo bar: one line in trace-soft, with "Leave the demo";
  - the licence bar: ochre-soft, shown when locked, linking "Buy or enter a key" to `#/licence`;
  - the offline banner: "No internet. Showing jobs saved on Thu 15 Oct." with "Work offline" on local runs, or "Offline mode is on." with "Go online".
- **Skip to content:** a button that focuses `<main id="main" tabIndex={-1}>`. It never navigates.
- **Route change** (`useRouteFocus`): scroll to the top, focus the page's `[data-page-title]` h1, and set `document.title` to "<h1 text> · Deis". It waits up to 1.5 s for a screen that loads first, then falls back to focusing `<main>`. Full-screen routes (Welcome, check-in) are found through their own `<main>`.
- **Errors:** each screen sits inside an `ErrorBoundary`, which resets on route change. It offers Reload, "Download a backup" and "Try this screen again". `src/app/global-error.tsx` covers the root.
- **Licence lock (read-only):** when `useStore().locked`:
  - the deck, Welcome and check-in show the licence screen, so no new kits get made;
  - Applications, Profile, Settings, export and the model page stay usable;
  - the KitQueue doesn't build.
- **Demo routes:** `#/demo/aoife` and `#/demo/rahul` load that persona (with `enterDemo`) and replace the hash with `#/deck`. An unknown persona goes to Welcome.

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

`PRIVACY_BADGE[where]` gives the badge text. `modelPill(m, offline)` gives the sidebar text. Never write "never leaves your device" by hand: use `privacy.sentence`.

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
