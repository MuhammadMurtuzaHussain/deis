import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import path from "node:path";

// Defence in depth: no page renders untrusted HTML, but nothing should frame Deis or
// change where its links and forms point. No script-src: Next's inline scripts and the
// Sentry endpoint stay as they are. Read at build time, so DEIS_HOSTED must be set
// for the build too (Render sets it for both).
const security = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ...(process.env.DEIS_HOSTED === "1" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  // The desktop app runs this same server on the user's machine (electron/main.mts).
  output: "standalone",
  // Loaded from node_modules at runtime, so every route shares one Key Value connection.
  serverExternalPackages: ["ioredis"],
  poweredByHeader: false,
  // The desktop app's server lives inside the signed app bundle, so its cache stays in memory.
  ...(process.env.DEIS_DESKTOP_BUILD === "1" ? { cacheHandler: path.join(process.cwd(), "desktop-cache-handler.cjs"), cacheMaxMemorySize: 0 } : {}),
  // Bottom left covers the "AI model" label in the nav.
  devIndicators: { position: "bottom-right" },
  headers: async () => [{ source: "/:path*", headers: security }],
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: { treeshake: { removeDebugLogging: true } },
});
