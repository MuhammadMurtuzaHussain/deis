"use client";

import type { Letter } from "@/lib/cv/schema";
import { Marked, Markers, PAPER, PAPER_VARS, stackHeight, useLine } from "./CvSheet";

// The cover letter as paper, with the same gutter markers and highlighter as the CV.

export function letterText(letter: Letter, name: string) {
  return ["Dear Hiring Team,", "", ...letter.paragraphs.map((p) => p.text), "", "Kind regards,", name].join("\n\n");
}

export function LetterView({ letter, title, name }: { letter: Letter; title: string; name: string }) {
  const line = useLine();
  return (
    <article aria-label="Cover letter preview" style={PAPER_VARS} className={`${PAPER} py-7 pr-5 pl-1 text-[14px] leading-relaxed sm:py-11 sm:pr-11 sm:pl-4`}>
      <div className="relative grid gap-4 pl-7">
        <p>Dear Hiring Team,</p>
        <p className="font-bold">Re: {title}</p>
        {letter.paragraphs.map((p, i) => {
          const l = line(p.facts);
          return (
            <p key={i} style={stackHeight(l.count)}>
              <Markers facts={p.facts} />
              <Marked on={l.on} lit={l.lit} paper>
                {p.text}
              </Marked>
            </p>
          );
        })}
        <p>
          Kind regards,
          <br />
          {name}
        </p>
      </div>
    </article>
  );
}
