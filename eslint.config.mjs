import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored from pdfjs-dist for in-browser PDF reading.
    "public/pdf.worker.min.mjs",
    "desktop/**",
    "release/**",
    // The Android shell (Capacitor); its web assets are copied in, not written here.
    "mobile/**",
  ]),
]);

export default eslintConfig;
