// Sentry on the server: agent traces and guard issues. Off unless SENTRY_DSN is set,
// and in the desktop app off unless the user turns on "Send anonymous diagnostics".
import * as Sentry from "@sentry/nextjs";
import { dataCollection, privacy } from "./src/lib/privacy";

Sentry.init({
  dsn: process.env.DEIS_DESKTOP === "1" && process.env.DEIS_DIAGNOSTICS !== "1" ? undefined : process.env.SENTRY_DSN,
  tracesSampleRate: 1,
  ...privacy,
  dataCollection,
});
