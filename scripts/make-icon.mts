// The desktop app icon (build/icon.png, 1024 px), rendered from the same mark as the favicon.
// npx tsx scripts/make-icon.mts
import { writeFileSync } from "node:fs";
import { ImageResponse } from "next/og";
import { createElement } from "react";
import { Mark } from "../src/lib/brand/icon";
import { markFont } from "../src/lib/brand/font";

const size = 1024;
// macOS icons sit on a transparent canvas with a margin around the tile.
const res = new ImageResponse(
  createElement("div", { style: { width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" } }, createElement(Mark, { size: 824 })),
  { width: size, height: size, fonts: await markFont() },
);
writeFileSync("build/icon.png", Buffer.from(await res.arrayBuffer()));
console.log("wrote build/icon.png");
