import type { MetadataRoute } from "next";
import { INK } from "@/lib/brand/icon";

// Makes Deis installable from the browser: Add to Home Screen in Safari is the iPhone app
// (no App Store), and Chrome on Android or desktop can install it too. Icons come from
// scripts/make-app-icons.mts.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Deis",
    short_name: "Deis",
    description: "Early-career jobs in Ireland, with a CV tailored by open-weight Gemma for each one.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: INK,
    theme_color: INK,
    lang: "en-IE",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
