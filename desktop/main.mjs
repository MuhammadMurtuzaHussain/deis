// Deis desktop: the same Next.js server the web demo runs, started on this machine
// with Electron's own Node, and shown in a window at a stable deis://app origin so
// the profile in IndexedDB survives restarts whatever port the server lands on.
import { app, BrowserWindow, dialog, Menu, net, protocol, session, shell } from "electron";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { mkdirSync, openSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = "deis://app";
// Settings shipped with the app: the hosted job feed, and the licence (Polar organisation, buy link; empty means no licence check).
const config = (() => {
  try {
    return JSON.parse(readFileSync(path.join(here, "config.json"), "utf8"));
  } catch {
    return {};
  }
})();
const FEED_URL = process.env.DEIS_FEED_URL ?? config.feedUrl ?? "https://deis-bu83.onrender.com";
// `--offline` locks offline mode on for this run; otherwise File > Work offline switches it.
const FORCED_OFFLINE = process.argv.includes("--offline");

protocol.registerSchemesAsPrivileged([{ scheme: "deis", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitFor(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("The Deis server didn't start in time.");
}

let server = null;
let port = 0;
let restarted = false;
let offline = FORCED_OFFLINE;
const logFile = () => path.join(app.getPath("logs"), "server.log");

async function startServer() {
  port = await freePort();
  const dir = app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(here, "..", ".next", "standalone");
  // The server's output goes to a log file the error box can point to.
  mkdirSync(path.dirname(logFile()), { recursive: true });
  const log = openSync(logFile(), "a");
  server = spawn(process.execPath, [path.join(dir, "server.js")], {
    cwd: dir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DEIS_DESKTOP: "1",
      DEIS_STATE_DIR: app.getPath("userData"),
      DEIS_LICENCE_FILE: path.join(app.getPath("userData"), "licence.json"),
      ...(FORCED_OFFLINE ? { DEIS_OFFLINE: "1" } : {}),
      ...(config.polarOrganizationId ? { DEIS_POLAR_ORG_ID: config.polarOrganizationId } : {}),
      ...(config.buyUrl ? { DEIS_BUY_URL: config.buyUrl } : {}),
      // Jobs come from the hosted feed (shared Google Jobs searches); employer boards are read directly if it's slow.
      DEIS_FEED_URL: FEED_URL,
      // No usage pings from the frameworks.
      MASTRA_TELEMETRY_DISABLED: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", log, log],
  });
  const child = server;
  child.on("exit", (code) => {
    if (app.isQuitting || child !== server) return;
    console.error("[deis] server exited", code);
    void recover();
  });
  await waitFor(`http://127.0.0.1:${port}/api/status`, 60_000);
  console.log(`[deis] server on 127.0.0.1:${port}`);
}

/** One automatic restart after a crash; a second crash says so and quits. */
async function recover() {
  if (restarted) return fail(new Error("The Deis server stopped twice."), "Deis stopped");
  restarted = true;
  try {
    await startServer();
    for (const w of BrowserWindow.getAllWindows()) w.reload();
  } catch (e) {
    fail(e, "Deis stopped");
  }
}

function fail(e, title = "Deis couldn't start") {
  console.error(e);
  dialog.showErrorBox(title, `${e?.message ?? e}\n\nThe server's log is at:\n${logFile()}`);
  app.isQuitting = true;
  server?.kill();
  app.quit();
}

// ---- Offline mode: the server enforces it for itself; this keeps the window to loopback too.

async function readOffline() {
  const was = offline;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/offline`);
    offline = (await r.json()).mode !== "off";
  } catch {
    // server busy or restarting: keep the last known mode
  }
  if (offline !== was) buildMenu();
}

async function setOffline(on) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/offline`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on }) });
    offline = (await r.json()).mode !== "off";
  } catch (e) {
    console.error("[deis] couldn't switch offline mode", e?.message);
  }
  buildMenu();
}

const LOCAL = /^(deis|devtools|chrome|chrome-extension|data|blob|about):/;
const LOOPBACK = /^(https?|wss?):\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//;

function guardWindowTraffic() {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const blocked = offline && !LOCAL.test(details.url) && !LOOPBACK.test(details.url);
    if (blocked) console.log("[deis] offline: blocked a request to", new URL(details.url).host);
    callback({ cancel: blocked });
  });
}

function buildMenu() {
  const mac = process.platform === "darwin";
  const workOffline = {
    label: "Work offline",
    type: "checkbox",
    checked: offline,
    enabled: !FORCED_OFFLINE,
    click: (item) => void setOffline(item.checked),
  };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(mac ? [{ role: "appMenu" }] : []),
      { label: "File", submenu: [workOffline, { type: "separator" }, mac ? { role: "close" } : { role: "quit" }] },
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
    ]),
  );
}

/** Job postings and apply links open in the user's own browser, never inside the app. */
function openOutside(url) {
  if (!/^https?:/.test(url)) return;
  console.log("[deis] opening in the browser:", new URL(url).host);
  void shell.openExternal(url);
}

async function createWindow() {
  // deis://app/x → http://127.0.0.1:<port>/x, headers and body included. The port is read per
  // request, so a restarted server on a new port is picked up.
  protocol.handle("deis", async (req) => {
    const url = new URL(req.url);
    const target = `http://127.0.0.1:${port}${url.pathname}${url.search}`;
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    // The page and the server are one origin here; Chromium refuses to forward deis:// as an Origin to http.
    const headers = new Headers(req.headers);
    headers.delete("origin");
    try {
      return await net.fetch(target, {
        method: req.method,
        headers,
        body: hasBody ? await req.arrayBuffer() : undefined,
      });
    } catch (e) {
      console.error("[deis] forward failed", req.method, url.pathname, e?.message);
      throw e;
    }
  });

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 600,
    title: "Deis",
    backgroundColor: "#0e1110",
    show: false,
    // Spellcheck on Windows and Linux downloads dictionaries from Google; macOS uses its own.
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: process.platform === "darwin" },
  });
  win.once("ready-to-show", () => win.show());
  win.on("focus", () => void readOffline());
  win.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(ORIGIN)) {
      e.preventDefault();
      openOutside(url);
    }
  });
  await win.loadURL(`${ORIGIN}/`);
}

app.on("before-quit", () => {
  app.isQuitting = true;
  server?.kill();
});
app.on("window-all-closed", () => app.quit());

app.whenReady().then(async () => {
  guardWindowTraffic();
  buildMenu();
  try {
    await startServer();
    await readOffline();
    // Wake the hosted feed early: a sleeping free-tier server takes a while, and the deck asks it first.
    if (!offline) fetch(`${FEED_URL}/api/status`, { signal: AbortSignal.timeout(60_000) }).catch(() => undefined);
    // Settings can switch offline mode too; the window filter follows within a few seconds.
    setInterval(() => void readOffline(), 5000).unref();
    await createWindow();
  } catch (e) {
    fail(e);
  }
});
