"use client";

import { useEffect } from "react";
import { Recovery } from "@/components/ErrorBoundary";
import "./globals.css";

// The last resort when the root layout itself fails. It replaces the whole document, so it
// brings its own <html>, the tokens and the saved theme. Fonts fall back to the system's.
export default function GlobalError({ error }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[deis] app error", error);
    try {
      const t = localStorage.getItem("deis.theme");
      if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
    } catch {
      // storage blocked: follow the system theme
    }
  }, [error]);
  return (
    <html lang="en-IE">
      <body className="min-h-dvh bg-bg px-4 py-16 text-ink">
        <title>Something went wrong · Deis</title>
        <Recovery />
      </body>
    </html>
  );
}
