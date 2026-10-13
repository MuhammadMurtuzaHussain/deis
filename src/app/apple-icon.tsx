import { ImageResponse } from "next/og";
import { markFont } from "@/lib/brand/font";
import { Mark } from "@/lib/brand/icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return new ImageResponse(<Mark size={180} />, { ...size, fonts: await markFont() });
}
