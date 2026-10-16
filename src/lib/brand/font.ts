import { readFile } from "node:fs/promises";
import path from "node:path";

// Bricolage Grotesque ExtraBold (SIL Open Font License), a static TTF because next/og can't
// read woff2 or variable fonts. The icons and the link preview use the app's own display face.
export const BRICOLAGE = "Bricolage Grotesque";

export const markFont = async () => [
  { name: BRICOLAGE, data: await readFile(path.join(process.cwd(), "src/lib/brand/BricolageGrotesque-ExtraBold.ttf")), style: "normal" as const, weight: 800 as const },
];
