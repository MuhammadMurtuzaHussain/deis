// CI's launch test for a packaged app: `node scripts/smoke-desktop.mjs <executable> [args…]`.
// Starts it with DEIS_SMOKE=1 (desktop/main.mjs starts the server, loads the window and exits 0)
// and fails if it exits otherwise or takes longer than two minutes.
import { spawn } from "node:child_process";

const [exe, ...args] = process.argv.slice(2);
if (!exe) throw new Error("Usage: node scripts/smoke-desktop.mjs <executable> [args…]");

const child = spawn(exe, args, { env: { ...process.env, DEIS_SMOKE: "1", DEIS_NO_UPDATES: "1" }, stdio: ["ignore", "pipe", "pipe"] });
let out = "";
for (const s of [child.stdout, child.stderr]) s.on("data", (d) => (out += d));

const timer = setTimeout(() => {
  console.error(`No answer from ${exe} after 120 s.\n${out}`);
  child.kill("SIGKILL");
  process.exit(1);
}, 120_000);

child.on("exit", (code) => {
  clearTimeout(timer);
  console.log(out);
  if (code === 0 && out.includes("smoke test passed")) {
    console.log("Launch test passed.");
    process.exit(0);
  }
  console.error(`Launch test failed: exit code ${code}.`);
  process.exit(1);
});
