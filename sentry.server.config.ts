// Sentry on the server: agent traces and guard issues. Off unless SENTRY_DSN is set,
// in the desktop app off unless DEIS_DIAGNOSTICS=1, and never while offline mode is on.
import * as Sentry from "@sentry/nextjs";
import { isOfflineMode } from "./src/lib/server/net";
import { dataCollection, privacy } from "./src/lib/privacy";

const off = (process.env.DEIS_DESKTOP === "1" && process.env.DEIS_DIAGNOSTICS !== "1") || isOfflineMode();

Sentry.init({
  dsn: off ? undefined : process.env.SENTRY_DSN,
  tracesSampleRate: 1,
  ...privacy,
  // Offline mode can be switched on after start: from then on nothing is sent.
  beforeSend: (event) => (isOfflineMode() ? null : privacy.beforeSend(event)),
  beforeSendTransaction: (event) => (isOfflineMode() ? null : event),
  dataCollection,
  // No kept-alive socket that could outlast the switch to offline mode.
  transportOptions: { keepAlive: false },
});
