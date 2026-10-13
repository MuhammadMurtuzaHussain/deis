// Sentry in the browser: errors and page timings only. No Session Replay: the screen
// shows someone's CV and job hunt, and that stays theirs.
import * as Sentry from "@sentry/nextjs";
import { dataCollection, privacy } from "./lib/privacy";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  ...privacy,
  dataCollection,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
