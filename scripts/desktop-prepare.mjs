// After `next build`: put the static files where the standalone server expects them,
// so the desktop app can ship .next/standalone as-is.
import { cpSync, existsSync, rmSync } from "node:fs";

const out = ".next/standalone";
if (!existsSync(`${out}/server.js`)) throw new Error("Run `next build` first (output: standalone).");
rmSync(`${out}/.next/static`, { recursive: true, force: true });
cpSync(".next/static", `${out}/.next/static`, { recursive: true });
cpSync("public", `${out}/public`, { recursive: true });
// Local secrets must never ride along in an installer.
for (const f of [".env", ".env.local", ".env.production"]) rmSync(`${out}/${f}`, { force: true });

// Installers need real files, not symlinks (pnpm uses nodeLinker: hoisted for this reason).
const ship = ".next/desktop-server";
rmSync(ship, { recursive: true, force: true });
cpSync(out, ship, { recursive: true, dereference: true });
console.log("standalone server ready in", out, "and, without symlinks, in", ship);
