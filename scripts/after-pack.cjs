/* eslint-disable @typescript-eslint/no-require-imports -- electron-builder loads this hook as CommonJS. */
// electron-builder drops node_modules from extraResources, so the prebuilt Next.js
// server (from scripts/desktop-prepare.mjs) is copied into the app here, after
// packing and before the installer is made.
const { cpSync, existsSync } = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const from = path.resolve(__dirname, "..", ".next", "desktop-server");
  if (!existsSync(path.join(from, "server.js"))) throw new Error("Run `pnpm desktop:build` first.");
  const resources =
    context.electronPlatformName === "darwin"
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : path.join(context.appOutDir, "resources");
  cpSync(from, path.join(resources, "server"), { recursive: true, dereference: true });
  console.log("  • copied the Deis server into", path.relative(process.cwd(), resources));
};
