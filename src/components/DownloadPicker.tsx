"use client";

import { AndroidLogo, AppleLogo, DownloadSimple, LinuxLogo, WindowsLogo } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { buttonClass } from "./ui";

// Installer names never change between versions (package.json "artifactName", and the APK in
// .github/workflows/android.yml), so
// releases/latest/download/<name> is always the newest build.
const LATEST = "https://github.com/MuhammadMurtuzaHussain/deis/releases/latest/download";

export const BUILDS = [
  { id: "mac-arm64", os: "mac", label: "Mac with Apple silicon", note: "M1 or later, macOS 12 or later", file: "Deis-mac-arm64.dmg", Icon: AppleLogo },
  { id: "mac-x64", os: "mac", label: "Mac with Intel", note: "macOS 12 or later", file: "Deis-mac-x64.dmg", Icon: AppleLogo },
  { id: "windows-x64", os: "windows", label: "Windows", note: "Windows 10 or 11, 64-bit", file: "Deis-windows-x64.exe", Icon: WindowsLogo },
  { id: "linux-x64", os: "linux", label: "Linux", note: "AppImage, 64-bit", file: "Deis-linux-x86_64.AppImage", Icon: LinuxLogo },
  { id: "android", os: "android", label: "Android phone", note: "Android 7 or later", file: "Deis-android.apk", Icon: AndroidLogo },
] as const;
type Build = (typeof BUILDS)[number];

export const downloadUrl = (b: Build) => `${LATEST}/${b.file}`;

type UAData = { platform?: string; getHighEntropyValues?: (h: string[]) => Promise<{ architecture?: string }> };

/** Which build this visitor most likely wants. Safari can't say Apple silicon or Intel; Apple silicon is the safe bet since 2020. */
async function detect(): Promise<Build["id"] | "iphone" | null> {
  const nav = navigator as Navigator & { userAgentData?: UAData };
  const ua = navigator.userAgent;
  const platform = nav.userAgentData?.platform ?? navigator.platform ?? "";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iphone";
  if (/mac/i.test(platform) || /Macintosh/.test(ua)) {
    const arch = await nav.userAgentData?.getHighEntropyValues?.(["architecture"]).catch(() => null);
    return arch?.architecture === "x86" ? "mac-x64" : "mac-arm64";
  }
  if (/win/i.test(platform)) return "windows-x64";
  if (/linux/i.test(platform)) return "linux-x64";
  return null;
}

/** The big button for this computer, and the other builds under it. */
export function DownloadPicker() {
  const [mine, setMine] = useState<Build["id"] | "iphone" | null | undefined>(undefined);
  useEffect(() => {
    void detect().then(setMine);
  }, []);
  const build = BUILDS.find((b) => b.id === mine);

  return (
    <div className="grid gap-6">
      <div className="grid justify-items-start gap-3">
        {build ? (
          <a href={downloadUrl(build)} className={`${buttonClass("primary", "lg")} gap-2`}>
            <DownloadSimple size={20} weight="bold" aria-hidden />
            Download for {build.label}
          </a>
        ) : (
          <p className="text-body text-ink-2">
            {mine === "iphone"
              ? "On an iPhone, Deis installs from Safari: open deiscareers.tech, tap Share, then Add to Home Screen."
              : mine === null
                ? "Deis runs on a Mac, Windows or Linux computer and on Android phones. Open this page there, or pick a build below."
                : "Finding the right build for this device."}
          </p>
        )}
        {build && <p className="text-caption text-ink-3">{build.note}. Not your device? Every build is below.</p>}
      </div>

      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Every build">
        {BUILDS.map((b) => (
          <li key={b.id}>
            <a
              href={downloadUrl(b)}
              className={`flex min-h-16 items-center gap-3 rounded-panel border px-4 py-3 transition-colors hover:bg-sunken ${b.id === mine ? "border-ink" : "border-line"}`}
            >
              <b.Icon size={24} aria-hidden className="shrink-0 text-ink" />
              <span className="min-w-0">
                <span className="block text-body font-medium text-ink">{b.label}</span>
                <span className="block truncate font-mono text-[12px] text-ink-3">{b.file}</span>
              </span>
              <DownloadSimple size={18} aria-hidden className="ml-auto shrink-0 text-ink-2" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
