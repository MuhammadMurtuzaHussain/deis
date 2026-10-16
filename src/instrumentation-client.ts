// Sentry in the browser: errors and page timings only. No Session Replay: the screen
// shows someone's CV and job hunt, and that stays theirs. Only on a web page served over
// http(s) by a build that has a DSN: never in the desktop app (deis://app), whatever
// the build inlined. Offline mode covers this window too: Sentry starts only once the
// server says it's online, and sends nothing from the moment it says otherwise.
import * as Sentry from "@sentry/nextjs";
import { dataCollection, privacy } from "./lib/privacy";
import { browserEnvironment } from "./lib/sentry-env";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const web = typeof location !== "undefined" && /^https?:$/.test(location.protocol);
let online = false;

async function checkOnline() {
  try {
    const r = await fetch("/api/offline", { cache: "no-store" });
    online = r.ok && ((await r.json()) as { mode?: string }).mode === "off";
  } catch {
    online = false;
  }
}

if (dsn && web) {
  void checkOnline().then(() => {
    if (!online) return;
    Sentry.init({
      dsn,
      environment: browserEnvironment(location.hostname),
      tracesSampleRate: 1,
      ...privacy,
      // A visitor's connection dropping (fonts, a fetch mid-swipe) says nothing about Deis.
      ignoreErrors: [/^(Error: )?NetworkError: A network error occurred\.?$/],
      beforeSend: (event) => (online ? privacy.beforeSend(event) : null),
      beforeSendTransaction: (event) => (online ? event : null),
      sendClientReports: false,
      dataCollection,
    });
    // Offline mode can be switched on while the page is open: then Sentry stops until a reload.
    const timer = setInterval(async () => {
      await checkOnline();
      if (online) return;
      clearInterval(timer);
      void Sentry.close(0);
    }, 60_000);
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
