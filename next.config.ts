import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The desktop app runs this same server on the user's machine (electron/main.mts).
  output: "standalone",
  // Loaded from node_modules at runtime, so every route shares one Key Value connection.
  serverExternalPackages: ["ioredis"],
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: { treeshake: { removeDebugLogging: true } },
});
