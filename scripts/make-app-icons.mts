// Icons for the installable web app (public/icons/) and the Android launcher
// (mobile/android/app/src/main/res/mipmap-*), rendered from the same mark as the favicon.
// npx tsx scripts/make-app-icons.mts
import { mkdirSync, writeFileSync } from "node:fs";
import { ImageResponse } from "next/og";
import { createElement, type ReactElement } from "react";
import { INK, Mark } from "../src/lib/brand/icon";
import { markFont } from "../src/lib/brand/font";

const fonts = await markFont();

async function png(file: string, size: number, el: ReactElement) {
  const res = new ImageResponse(el, { width: size, height: size, fonts });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

/** The mark at `scale` of the canvas, centred, on ink or on a clear background. */
const padded = (size: number, scale: number, background: string) =>
  createElement(
    "div",
    { style: { width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background } },
    createElement(Mark, { size: Math.round(size * scale), shape: "none" }),
  );

mkdirSync("public/icons", { recursive: true });
await png("public/icons/icon-192.png", 192, createElement(Mark, { size: 192 }));
await png("public/icons/icon-512.png", 512, createElement(Mark, { size: 512 }));
// Maskable: full bleed, with the mark inside the 80% safe zone.
await png("public/icons/maskable-512.png", 512, padded(512, 0.72, INK));

// Android: legacy icons at 48 dp, the adaptive foreground at 108 dp with the mark inside the 66 dp safe zone.
const RES = "mobile/android/app/src/main/res";
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [name, k] of Object.entries(DENSITIES)) {
  const dir = `${RES}/mipmap-${name}`;
  mkdirSync(dir, { recursive: true });
  await png(`${dir}/ic_launcher.png`, 48 * k, createElement(Mark, { size: 48 * k }));
  await png(`${dir}/ic_launcher_round.png`, 48 * k, createElement(Mark, { size: 48 * k, shape: "circle" }));
  await png(`${dir}/ic_launcher_foreground.png`, 108 * k, padded(108 * k, 0.6, "transparent"));
}
console.log("wrote public/icons and the Android mipmaps");
