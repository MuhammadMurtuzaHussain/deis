"use client";

import { Play } from "@phosphor-icons/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

// The one-minute launch film on the web demo's landing page. A poster from the film shows until
// someone presses play; only then does the page load YouTube, from its privacy-enhanced domain,
// so a visitor who never watches never talks to Google. Not in the desktop app, which has to
// work offline.

export const FILM_ID = "LXKSvYJGxeA";

export function LaunchVideo() {
  const [playing, setPlaying] = useState(false);
  const player = useRef<HTMLIFrameElement>(null);
  // The button goes when the player arrives, so keyboard focus moves into the player rather than the page.
  useEffect(() => {
    if (playing) player.current?.focus();
  }, [playing]);
  return (
    <figure className="grid gap-3">
      <div className="relative aspect-video overflow-hidden rounded-panel border border-line bg-surface">
        {playing ? (
          <iframe
            ref={player}
            src={`https://www.youtube-nocookie.com/embed/${FILM_ID}?autoplay=1&rel=0`}
            title="Deis in one minute"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 size-full"
          />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0">
            <Image src="/deis-film-poster.jpg" alt="" fill sizes="(min-width: 1024px) 1100px, 100vw" className="object-cover" />
            <span className="absolute bottom-4 left-4 inline-flex h-11 items-center gap-2 rounded-pill bg-ink pr-4 pl-3 text-body font-medium text-bg shadow-lg transition-transform group-hover:scale-105 motion-reduce:transition-none sm:bottom-6 sm:left-6">
              <Play size={18} weight="fill" aria-hidden />
              Play the film
              <span className="font-mono text-caption opacity-70">1:01</span>
            </span>
            <span className="sr-only">. It loads from YouTube.</span>
          </button>
        )}
      </div>
      <figcaption className="text-caption text-ink-3">
        One minute, with sound. It loads from YouTube when you press play.{" "}
        <a href={`https://youtu.be/${FILM_ID}`} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-ink">
          Watch on YouTube
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </figcaption>
    </figure>
  );
}
