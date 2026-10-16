"use client";

import type { Letter } from "@/lib/cv/schema";
import { Markers, stackHeight, useLine } from "./CvSheet";

// The cover letter as paper, with the same margin markers as the CV.

export function letterText(letter: Letter, name: string) {
  return ["Dear Hiring Team,", "", ...letter.paragraphs.map((p) => p.text), "", "Kind regards,", name].join("\n\n");
}

export function LetterView({ letter, title, name }: { letter: Letter; title: string; name: string }) {
  const line = useLine();
  return (
    <article aria-label="Cover letter preview" className="w-full min-w-0 rounded-surface bg-white py-7 pr-5 pl-1 font-paper text-[14px] leading-relaxed text-[#1a1a1a] shadow-card sm:py-11 sm:pr-11 sm:pl-4">
      <div className="relative grid gap-4 pl-7">
        <p>Dear Hiring Team,</p>
        <p className="font-bold">Re: {title}</p>
        {letter.paragraphs.map((p, i) => {
          const l = line(p.facts);
          return (
            <p key={i} style={stackHeight(l.count)}>
              <Markers facts={p.facts} />
              <span className={`rounded-[2px] box-decoration-clone transition-colors duration-150 ${l.lit ? "bg-[#E3ECF5] shadow-[0_0_0_3px_#E3ECF5]" : ""}`}>{p.text}</span>
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
