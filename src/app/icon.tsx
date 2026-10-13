import { ImageResponse } from "next/og";
import { markFont } from "@/lib/brand/font";
import { Mark } from "@/lib/brand/icon";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default async function Icon() {
  return new ImageResponse(<Mark size={64} />, { ...size, fonts: await markFont() });
}
