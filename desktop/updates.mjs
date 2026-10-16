// Updates from GitHub Releases, checked 10 s after launch and then once a day.
// Windows and Linux (AppImage): electron-updater downloads the new installer in the
// background, checks its SHA-512 against the release's latest.yml, and installs it when
// Deis quits, or straight away if the person chooses Restart now.
// macOS: Squirrel.Mac only installs updates signed with an Apple Developer ID, and these
// builds aren't, so Deis says a new version is out and opens the download page.
// Never while offline mode is on: the person asked for no network.
import { createRequire } from "node:module";

const REPO = "MuhammadMurtuzaHussain/deis";
const DAY = 24 * 60 * 60 * 1000;

/** "0.2.0" > "0.1.10"? Numbers only; a pre-release tag counts as older than its release. */
export function isNewer(latest, current) {
  const parse = (v) => String(v).replace(/^v/, "").split("-")[0].split(".").map((n) => Number(n) || 0);
  const [a, b] = [parse(latest), parse(current)];
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

export function startUpdates({ app, dialog, shell, isOffline, downloadPage }) {
  if (!app.isPackaged || process.env.DEIS_NO_UPDATES || process.env.DEIS_SMOKE) return () => {};
  const check = process.platform === "darwin" ? macNotice({ app, dialog, shell, downloadPage }) : (autoInstall({ app, dialog }) ?? macNotice({ app, dialog, shell, downloadPage }));
  const run = (manual) => (isOffline() ? manual && say(dialog, "Deis is working offline", "Switch off File > Work offline to check for updates.") : check(manual));
  setTimeout(() => void run(false), 10_000).unref?.();
  setInterval(() => void run(false), DAY).unref?.();
  return (manual = true) => run(manual);
}

const say = (dialog, message, detail) => dialog.showMessageBox({ type: "info", buttons: ["OK"], message, detail });

/** Windows and Linux: electron-updater, bundled into updater.cjs by scripts/desktop-prepare.mjs. */
function autoInstall({ app, dialog }) {
  // An AppImage is the only Linux build that can replace itself.
  if (process.platform === "linux" && !process.env.APPIMAGE) return null;
  let autoUpdater;
  try {
    autoUpdater = createRequire(import.meta.url)("./updater.cjs").autoUpdater;
  } catch (e) {
    console.error("[deis] updater not bundled", e?.message);
    return null;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = { info: (m) => console.log("[deis] update:", m), warn: (m) => console.warn("[deis] update:", m), error: (m) => console.error("[deis] update:", m), debug: () => {} };
  let asked = null;
  autoUpdater.on("update-downloaded", async (info) => {
    if (asked === info.version) return;
    asked = info.version;
    const { response } = await dialog.showMessageBox({
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      message: `Deis ${info.version} is ready to install`,
      detail: "It installs when you quit Deis, or now if you restart. Your profile and applications stay as they are.",
    });
    if (response === 0) {
      app.isQuitting = true;
      autoUpdater.quitAndInstall();
    }
  });
  autoUpdater.on("error", (e) => console.error("[deis] update failed:", e?.message ?? e));
  return async (manual) => {
    try {
      const result = await autoUpdater.checkForUpdates();
      if (manual && !(result?.updateInfo && isNewer(result.updateInfo.version, app.getVersion()))) await say(dialog, "Deis is up to date", `You have version ${app.getVersion()}.`);
      else if (manual) await say(dialog, `Deis ${result.updateInfo.version} is downloading`, "Deis will ask you to restart when it's ready.");
    } catch (e) {
      if (manual) await say(dialog, "Couldn't check for updates", e?.message ?? String(e));
    }
  };
}

/** macOS: read the latest release and offer the download page. Each version is offered once per run. */
function macNotice({ app, dialog, shell, downloadPage }) {
  let offered = null;
  return async (manual) => {
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
      const latest = String((await r.json()).tag_name ?? "").replace(/^v/, "");
      if (!isNewer(latest, app.getVersion())) return manual ? void (await say(dialog, "Deis is up to date", `You have version ${app.getVersion()}.`)) : undefined;
      if (offered === latest && !manual) return;
      offered = latest;
      const { response } = await dialog.showMessageBox({
        type: "info",
        buttons: ["Download", "Later"],
        defaultId: 0,
        cancelId: 1,
        message: `Deis ${latest} is out`,
        detail: `You have ${app.getVersion()}. Download the new version and drag it into Applications to replace this one. Your profile and applications stay as they are.`,
      });
      if (response === 0) void shell.openExternal(downloadPage);
    } catch (e) {
      console.error("[deis] update check failed:", e?.message ?? e);
      if (manual) await say(dialog, "Couldn't check for updates", e?.message ?? String(e));
    }
  };
}
