"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Application } from "@/lib/client/db";
import { updateApplication } from "@/lib/client/kit";
import { textareaClass } from "../ui";

// Notes save as you type (after a short pause), on blur and when you leave the screen,
// so nothing typed is lost to a route change (CH-20).

const PAUSE = 600;

export function Notes({ app }: { app: Application }) {
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = app.id;

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const text = pending.current;
    if (text === null) return;
    pending.current = null;
    await updateApplication(id, { notes: text });
    setSaved("saved");
  }, [id]);

  // Leaving the screen saves whatever is waiting.
  useEffect(
    () => () => {
      void flush();
    },
    [flush],
  );

  return (
    <div className="grid gap-1.5">
      <label htmlFor="notes-box" className="text-caption text-ink-3">
        Your notes
      </label>
      <textarea
        id="notes-box"
        rows={3}
        defaultValue={app.notes}
        onChange={(e) => {
          pending.current = e.target.value;
          setSaved("saving");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void flush(), PAUSE);
        }}
        onBlur={() => void flush()}
        className={textareaClass}
        placeholder="Who you spoke to, referral, interview dates"
      />
      <p className="h-5 text-caption text-ink-3" aria-hidden>
        {saved === "saving" ? "Saving…" : saved === "saved" ? "Saved on this device" : ""}
      </p>
    </div>
  );
}
