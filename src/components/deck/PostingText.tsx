import { postingBlocks } from "@/lib/jobs/posting";

/** The full posting as headings, paragraphs and lists, not one block of lines (src/lib/jobs/posting.ts). */
export function PostingText({ text }: { text: string }) {
  return (
    <div className="grid gap-3">
      {postingBlocks(text).map((b, i) =>
        b.kind === "heading" ? (
          <h3 key={i} className="mt-2 text-body font-semibold text-ink first:mt-0">
            {b.text}
          </h3>
        ) : b.kind === "paragraph" ? (
          <p key={i}>{b.text}</p>
        ) : (
          <ul key={i} className="grid list-disc gap-1.5 pl-5 marker:text-ink-3">
            {b.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
