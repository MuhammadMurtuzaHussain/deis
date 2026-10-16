import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // First, before Sentry or anything else can open a socket: in offline mode only loopback connects.
    const { installEgressGuard } = await import("./lib/server/net");
    installEgressGuard();
    await import("../sentry.server.config");
  }
}

// Imported on demand so nothing from Sentry loads before the guard is in place.
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  const Sentry = await import("@sentry/nextjs");
  return Sentry.captureRequestError(...args);
};
