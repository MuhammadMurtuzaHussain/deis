import { readFile } from "node:fs/promises";
import path from "node:path";

// Atkinson Hyperlegible Next Bold Italic (SIL Open Font License), so the mark uses the app's own type.
export const markFont = async () => [
  { name: "Atkinson", data: await readFile(path.join(process.cwd(), "src/lib/brand/AtkinsonHyperlegibleNext-BoldItalic.ttf")), style: "italic" as const, weight: 700 as const },
];
