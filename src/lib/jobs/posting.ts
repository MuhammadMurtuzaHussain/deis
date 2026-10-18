// A posting's text, sanitised to plain lines (sanitize.ts), back into something readable:
// headings, paragraphs and lists. Presentation only: Gemma and the filters keep reading the
// plain text. Two shapes come in. Board postings keep their "•" items under short headings.
// Google Jobs drops the markers, so each item is a short line on its own, between blank lines,
// and reads as a stack of paragraphs unless it's put back into a list (first-user feedback).

export type PostingBlock = { kind: "heading"; text: string } | { kind: "paragraph"; text: string } | { kind: "list"; items: string[] };

const MARKER = /^(?:[•·▪◦‣●○■□–-]|\*|\d{1,2}[.)])\s+/;
/** Longer than this, an unmarked line is prose, not a list item. */
const ITEM_MAX = 200;

type Kind = "bullet" | "label" | "short" | "long";

function kindOf(line: string): Kind {
  if (MARKER.test(line)) return "bullet";
  const words = line.split(/\s+/).length;
  // "What you'll do", "Responsibilities", "Requirements:". Not "Location: Cork" (a label and a value).
  const isLabel = line.length <= 60 && words <= 8 && !/[.!?;,]$/.test(line) && (!/:\s/.test(line) || line.endsWith(":"));
  if (isLabel) return "label";
  return line.length > ITEM_MAX ? "long" : "short";
}

/** Words a sentence can't end on: a line ending in one was cut where the posting had bold or a link. */
const JOINS_NEXT = /(?:^|\s)(?:a|an|the|in|of|with|to|for|and|or|as|by|on|at|from|into|including|like|such as|up to|recent)$/i;

/**
 * Google Jobs breaks a sentence wherever the original had bold or a link:
 * "Familiarity with" / "NumPy" / "," / "Pandas" / ", Matplotlib, or similar libraries."
 * Adjacent lines are joined back when the second starts with punctuation or a lower-case letter,
 * or the first ends with a comma or a word a sentence can't end on.
 */
function rejoin(raw: string[]): string[] {
  const out: string[] = [];
  for (const line of raw.map((l) => l.trim())) {
    const prev = out.at(-1);
    if (line && prev && !MARKER.test(line)) {
      if (/^[,.;:)!?]/.test(line)) {
        out[out.length - 1] = prev + line;
        continue;
      }
      if (/^[a-z]/.test(line) || prev.endsWith(",") || JOINS_NEXT.test(prev)) {
        out[out.length - 1] = `${prev} ${line}`;
        continue;
      }
    }
    out.push(line);
  }
  return out;
}

export function postingBlocks(text: string): PostingBlock[] {
  const lines = rejoin(text.split("\n")).filter(Boolean);
  const kinds = lines.map(kindOf);
  const out: PostingBlock[] = [];
  let list: { items: string[]; marked: boolean } | null = null;
  const flush = () => {
    if (list) out.push({ kind: "list", items: list.items });
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const k = kinds[i];
    if (k === "bullet") {
      if (!list?.marked) flush();
      list ??= { items: [], marked: true };
      list.items.push(line.replace(MARKER, ""));
    } else if (k === "label") {
      // Three or more labels in a row are a list without markers ("Python", "SQL", "Excel"),
      // not three headings. One or two are headings, as in "Who we are" then "About Stripe".
      const run = (j: number) => kinds[j] === "label";
      const inRun = (run(i + 1) && run(i + 2)) || (run(i - 1) && run(i + 1)) || (run(i - 1) && run(i - 2));
      if (inRun) {
        if (list?.marked) flush();
        list ??= { items: [], marked: false };
        list.items.push(line);
      } else {
        flush();
        out.push({ kind: "heading", text: line });
      }
    } else if (k === "short") {
      // A short line continues an unmarked list, or starts one when the next line is short too.
      // A lead-in ("…any of the following:") or a line before a marked list stays a paragraph.
      if (line.endsWith(":")) {
        flush();
        out.push({ kind: "paragraph", text: line });
      } else if (list && !list.marked) list.items.push(line);
      else if (kinds[i + 1] === "short") {
        flush();
        list = { items: [line], marked: false };
      } else {
        flush();
        out.push({ kind: "paragraph", text: line });
      }
    } else {
      flush();
      out.push({ kind: "paragraph", text: line });
    }
  }
  flush();
  return out;
}
