// Which Sentry environment an event comes from, so laptop testing never mixes with the
// demo's numbers: "demo" is the hosted site on Render, "desktop" the installed app (only
// with DEIS_DIAGNOSTICS=1), and anything else, a local `next start` included, is
// "development". SENTRY_ENVIRONMENT overrides it.

type Env = Record<string, string | undefined>;

export function serverEnvironment(env: Env): string {
  if (env.SENTRY_ENVIRONMENT) return env.SENTRY_ENVIRONMENT;
  if (env.DEIS_DESKTOP === "1") return "desktop";
  if (env.RENDER) return "demo";
  return "development";
}

/** The browser only runs Sentry on web pages, so a page on this machine or the local network is development. */
export function browserEnvironment(hostname: string): string {
  return /^(localhost|127\.|\[?::1\]?$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname) || hostname.endsWith(".local") ? "development" : "demo";
}
