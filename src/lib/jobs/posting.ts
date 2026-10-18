// A posting's text, sanitised to plain lines (sanitize.ts), back into something readable:
// headings, paragraphs and lists. Presentation only: Gemma and the filters keep reading the
// plain text. Two shapes come in. Board postings keep their "•" items under short headings.
// Google Jobs drops the markers, so each item is a short line on its own, and reads as a
// stack of paragraphs unless it's put back into a list (first-user feedback).

export type PostingBlock = { kind: "heading"; text: string } | { kind: "paragraph"; text: string } | { kind: "list"; items: string[] };

const MARKER = /^(?:[•·▪◦‣●○■□–-]|\*|\d{1,2}[.)])\s+/;
/** Longer than this, an unmarked line is prose, not a list item. */
const ITEM_MAX = 200;
/** Without a heading or a lead-in to say so, only this many short lines in a row make a list. */
const BARE_LIST_MIN = 4;

type Kind = "bullet" | "label" | "short" | "long";

function kindOf(line: string): Kind {
  if (MARKER.test(line)) return "bullet";
  const words = line.split(/\s+/).length;
  // "What you'll do", "Responsibilities", "Requirements:". Not "Location: Cork" (a label and a value).
  const isLabel = line.length <= 60 && words <= 8 && !/[.!?;,]$/.test(line) && (!/:\s/.test(line) || line.endsWith(":"));
  if (isLabel) return "label";
  return line.length > ITEM_MAX ? "long" : "short";
}

const MINOR = /^(?:a|an|the|and|or|of|to|in|for|with|on|at|by|as|from|your|our|you|we|is|are)$/i;

/** "What You Will Gain", "Key Area of Responsibility": most words capitalised, as headings in Google postings are. */
function titleCase(line: string): boolean {
  const words = line.split(/\s+/).filter((w) => /[A-Za-z]/.test(w) && !MINOR.test(w));
  return words.length > 0 && words.filter((w) => /^[A-Z0-9]/.test(w)).length / words.length >= 0.75;
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
  const paragraph = (text: string) => {
    flush();
    out.push({ kind: "paragraph", text });
  };
  /** After a heading, after a lead-in ending in a colon, or at the very top. */
  const listExpected = () => {
    const last = out.at(-1);
    return !last || last.kind === "heading" || (last.kind === "paragraph" && last.text.endsWith(":"));
  };
  const afterLeadIn = () => {
    const last = out.at(-1);
    return last?.kind === "paragraph" && last.text.endsWith(":");
  };
  const shortRun = (from: number) => {
    let n = 0;
    while (from + n < kinds.length && (kinds[from + n] === "short" || kinds[from + n] === "label")) n++;
    return n;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const k = kinds[i];
    if (k === "bullet") {
      if (!list?.marked) flush();
      list ??= { items: [], marked: true };
      list.items.push(line.replace(MARKER, ""));
    } else if (k === "label") {
      const heading = titleCase(line) || line.endsWith(":");
      // Three or more labels in a row are a list without markers ("Python", "SQL", "Excel"),
      // capitalised or not: one-word skills always look like Title Case.
      const run = (j: number) => kinds[j] === "label";
      const inRun = (run(i + 1) && run(i + 2)) || (run(i - 1) && run(i + 1)) || (run(i - 1) && run(i - 2));
      if (inRun || (list && !list.marked && !heading) || (!list && afterLeadIn() && !heading)) {
        if (list?.marked) flush();
        list ??= { items: [], marked: false };
        list.items.push(line);
      } else {
        flush();
        out.push({ kind: "heading", text: line });
      }
    } else if (k === "short") {
      if (line.endsWith(":")) paragraph(line);
      else if (list && !list.marked) list.items.push(line);
      else if (!list && (afterLeadIn() || (listExpected() && shortRun(i) >= 2) || shortRun(i) >= BARE_LIST_MIN)) {
        list = { items: [line], marked: false };
      } else paragraph(line);
    } else {
      paragraph(line);
    }
  }
  flush();
  return out;
}
