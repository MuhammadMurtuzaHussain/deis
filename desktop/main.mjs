// Deis desktop: the same Next.js server the web demo runs, started on this machine
// with Electron's own Node, and shown in a window at a stable deis://app origin so
// the profile in IndexedDB survives restarts whatever port the server lands on.
import { app, BrowserWindow, net, protocol, shell } from "electron";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = "deis://app";

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

async function waitFor(url, ms = 30000) {
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
  throw new Error("The Deis server didn't start.");
}

let server = null;

async function startServer() {
  const port = await freePort();
  const dir = app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(here, "..", ".next", "standalone");
  server = spawn(process.execPath, [path.join(dir, "server.js")], {
    cwd: dir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DEIS_DESKTOP: "1",
      // Jobs come from the hosted feed (shared Google Jobs searches); employer boards are read directly.
      DEIS_FEED_URL: process.env.DEIS_FEED_URL ?? "https://deis.onrender.com",
    },
    stdio: "inherit",
  });
  server.on("exit", (code) => {
    if (code && !app.isQuitting) console.error("[deis] server exited", code);
  });
  await waitFor(`http://127.0.0.1:${port}/api/status`);
  console.log(`[deis] server on 127.0.0.1:${port}`);
  return port;
}

async function createWindow(port) {
  // deis://app/x → http://127.0.0.1:<port>/x, headers and body included.
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
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.once("ready-to-show", () => win.show());
  // Job postings and apply links open in the user's own browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(ORIGIN)) {
      e.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
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
  try {
    const port = await startServer();
    await createWindow(port);
  } catch (e) {
    console.error(e);
    app.quit();
  }
});
