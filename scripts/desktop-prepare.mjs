// After `next build`: put the static files where the standalone server expects them,
// so the desktop app can ship .next/standalone as-is.
import { execSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";

// --build runs `next build` first with the window's Sentry DSN blanked, the same way on every
// OS's shell. Next keeps a variable already set, even empty, over the one in .env.local.
if (process.argv.includes("--build")) {
  // Starter jobs for an offline first run (public/starter-jobs.json). Soft: offline, a build
  // keeps the last snapshot (or ships none, and the deck says it needs a connection).
  try {
    execSync("npx tsx scripts/feed-snapshot.mts", { stdio: "inherit", timeout: 120_000 });
  } catch {
    console.warn(existsSync("public/starter-jobs.json") ? "Feed snapshot failed; keeping the last public/starter-jobs.json." : "Feed snapshot failed; building without starter jobs.");
  }
  execSync("next build", { stdio: "inherit", env: { ...process.env, NEXT_PUBLIC_SENTRY_DSN: "", DEIS_DESKTOP_BUILD: "1" } });
}

const out = ".next/standalone";
if (!existsSync(`${out}/server.js`)) throw new Error("Run `next build` first (output: standalone).");
// Without the in-memory cache the server writes pages into the signed app bundle (next.config.ts).
if (!readFileSync(`${out}/.next/required-server-files.json`, "utf8").includes("desktop-cache-handler")) {
  throw new Error("This build has no desktop cache handler. Build with DEIS_DESKTOP_BUILD=1 (`pnpm desktop:build` does).");
}
rmSync(`${out}/.next/static`, { recursive: true, force: true });
cpSync(".next/static", `${out}/.next/static`, { recursive: true });
cpSync("public", `${out}/public`, { recursive: true });
// Local secrets must never ride along in an installer.
for (const f of [".env", ".env.local", ".env.production"]) rmSync(`${out}/${f}`, { force: true });

// The desktop app sends nothing to Sentry from the window. A build with NEXT_PUBLIC_SENTRY_DSN
// set (from .env.local, say) inlines it into the page's code, so refuse to ship one.
const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const leaky = files(`${out}/.next/static`).filter((f) => f.endsWith(".js") && readFileSync(f, "utf8").includes("ingest."));
if (leaky.length) {
  throw new Error(`A Sentry DSN is inlined in ${leaky.length} page file(s), e.g. ${leaky[0]}. Build the desktop app with NEXT_PUBLIC_SENTRY_DSN set to empty.`);
}

// Installers need real files, not symlinks (pnpm uses nodeLinker: hoisted for this reason).
const ship = ".next/desktop-server";
rmSync(ship, { recursive: true, force: true });
cpSync(out, ship, { recursive: true, dereference: true });
// cpSync only dereferences the top level: nested links (Turbopack's hashed aliases in
// .next/node_modules) come out as absolute links into this checkout, which breaks the app on
// any other machine and fails codesign. Swap each for a copy of what it points at.
const links = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) return [p];
    return e.isDirectory() ? links(p) : [];
  });
for (let round = 0, left = links(ship); left.length; left = links(ship)) {
  if (++round > 5) throw new Error(`Symlinks left in ${ship}, e.g. ${left[0]}.`);
  for (const p of left) {
    const target = realpathSync(p);
    rmSync(p, { recursive: true, force: true });
    cpSync(target, p, { recursive: true, dereference: true });
  }
}
console.log("standalone server ready in", out, "and, without symlinks, in", ship);

// The packaged app ships no node_modules, so electron-updater (Windows and Linux updates,
// desktop/updates.mjs) goes in as one bundled file. Electron itself stays external.
execSync("npx esbuild node_modules/electron-updater/out/main.js --bundle --platform=node --format=cjs --target=node22 --external:electron --minify --log-level=warning --outfile=desktop/updater.cjs", { stdio: "inherit" });
console.log("bundled electron-updater into desktop/updater.cjs");
