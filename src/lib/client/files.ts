// Saving files and printing, in the browser and in the Android app (mobile/). The Android app
// loads this same site in a WebView, where <a download> on a blob and window.print() do
// nothing. There, Capacitor's bridge is injected into the page and these calls go to native
// plugins by name, so the web app needs no Capacitor package of its own.

type Bridge = {
  isNativePlatform?: () => boolean;
  PluginHeaders?: { name: string }[];
  nativePromise?: <T>(plugin: string, method: string, options?: object) => Promise<T>;
};

function bridge(plugin: string): Bridge | null {
  const cap = (globalThis as { Capacitor?: Bridge }).Capacitor;
  if (!cap?.isNativePlatform?.() || !cap.nativePromise) return null;
  return cap.PluginHeaders?.some((h) => h.name === plugin) ? cap : null;
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(",") + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Save a Blob as a file. On Android: written to the app's cache, then the share sheet, where Files, Drive or email can take it. */
export async function saveFile(blob: Blob, name: string) {
  const cap = bridge("Filesystem") && bridge("Share");
  if (cap?.nativePromise) {
    const { uri } = await cap.nativePromise<{ uri: string }>("Filesystem", "writeFile", { path: name, data: await base64(blob), directory: "CACHE" });
    try {
      await cap.nativePromise("Share", "share", { title: name, files: [uri], dialogTitle: "Save or send" });
    } catch (e) {
      // Closing the share sheet isn't an error.
      if (!/cancel/i.test(e instanceof Error ? e.message : String(e))) throw e;
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Print the page with its print styles. On Android: the system print dialog, where Save as PDF is a printer. */
export async function printPage(name: string) {
  const cap = bridge("DeisPrint");
  if (cap?.nativePromise) await cap.nativePromise("DeisPrint", "print", { name });
  else window.print();
}
