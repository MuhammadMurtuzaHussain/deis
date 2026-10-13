"use client";

import { useEffect, useRef, useState } from "react";
import { deleteEverything, exportAll, getMeta, importAll, setMeta } from "@/lib/client/db";
import type { KitParts } from "@/lib/client/kit";
import { useStore } from "@/lib/client/store";
import { ModelSetup } from "./ModelSetup";
import { Button, Chip, Dialog, Notice } from "./ui";

// Settings: the model, how kits are built, appearance, and the user's own data,
// which they can export, restore or delete in one go.

type Theme = "system" | "light" | "dark";

function applyTheme(t: Theme) {
  const d = document.documentElement;
  if (t === "system") delete d.dataset.theme;
  else d.dataset.theme = t;
  try {
    if (t === "system") localStorage.removeItem("deis.theme");
    else localStorage.setItem("deis.theme", t);
  } catch {
    // storage blocked: the choice lasts this session
  }
}

export function Settings() {
  const { status } = useStore();
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const t = typeof window === "undefined" ? null : localStorage.getItem("deis.theme");
      return t === "light" || t === "dark" ? t : "system";
    } catch {
      return "system";
    }
  });
  const [lane, setLane] = useState<"quick" | "careful" | null>(null);
  const [parts, setParts] = useState<KitParts>({ letter: true, answers: true });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getMeta<"quick" | "careful" | null>("lane", null).then(setLane);
    void getMeta<KitParts>("kitParts", { letter: true, answers: true }).then(setParts);
  }, []);

  return (
    <div className="grid gap-12">
      <h1 className="text-3xl font-bold">Settings</h1>

      <section aria-labelledby="ai" className="grid gap-2">
        <h2 id="ai" className="text-xl font-bold">
          AI model
        </h2>
        <p className="max-w-[62ch] text-ink-2">Deis is the app; the model is yours. Switch any time, nothing is lost.</p>
        <ModelSetup embedded />
      </section>

      <section aria-labelledby="kits" className="grid gap-4">
        <h2 id="kits" className="text-xl font-bold">
          After a swipe right
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Chip on={lane === "quick"} onClick={() => (setLane("quick"), void setMeta("lane", "quick"))}>
            Quick: build the kit in the background
          </Chip>
          <Chip on={lane === "careful"} onClick={() => (setLane("careful"), void setMeta("lane", "careful"))}>
            Careful: ask about my gaps first
          </Chip>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Chip on={parts.letter} onClick={() => (setParts({ ...parts, letter: !parts.letter }), void setMeta("kitParts", { ...parts, letter: !parts.letter }))}>
            Write a cover letter
          </Chip>
          <Chip on={parts.answers} onClick={() => (setParts({ ...parts, answers: !parts.answers }), void setMeta("kitParts", { ...parts, answers: !parts.answers }))}>
            Draft form answers
          </Chip>
        </div>
        <p className="text-sm text-ink-3">On a laptop, a CV alone takes about half the time of a full kit.</p>
      </section>

      <section aria-labelledby="look" className="grid gap-4">
        <h2 id="look" className="text-xl font-bold">
          Appearance
        </h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Colour scheme">
          {(["system", "light", "dark"] as Theme[]).map((t) => (
            <Chip key={t} on={theme === t} onClick={() => (setTheme(t), applyTheme(t))}>
              {t === "system" ? "Match my computer" : t === "light" ? "Light" : "Dark"}
            </Chip>
          ))}
        </div>
      </section>

      <section aria-labelledby="data" className="grid gap-4">
        <h2 id="data" className="text-xl font-bold">
          Your data
        </h2>
        <p className="max-w-[64ch] text-ink-2">
          Your profile, applications and kits live only in {status?.desktop ? "this app" : "this browser"}. There&apos;s no account and no copy on a server. Make a backup before you clear your browser or move computer.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={async () => {
              const url = URL.createObjectURL(new Blob([JSON.stringify(await exportAll(), null, 2)], { type: "application/json" }));
              Object.assign(document.createElement("a"), { href: url, download: `deis-backup-${new Date().toISOString().slice(0, 10)}.json` }).click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Download a backup
          </Button>
          <Button onClick={() => fileRef.current?.click()}>Restore a backup</Button>
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete everything
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Restore a Deis backup file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                await importAll(JSON.parse(await f.text()));
                setMessage({ tone: "ok", text: "Backup restored." });
              } catch (err) {
                setMessage({ tone: "error", text: err instanceof Error ? err.message : "That backup couldn't be read." });
              }
            }}
          />
        </div>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
      </section>

      <section aria-labelledby="about" className="grid gap-2 text-ink-2">
        <h2 id="about" className="text-xl font-bold text-ink">
          About Deis
        </h2>
        <p className="max-w-[64ch]">
          <span className="ga text-ink">Deis</span> is Irish for opportunity. It&apos;s open source under AGPL-3.0: you can read every line, build it yourself and run it for free. The paid app saves you the setup and pays for the daily Irish job feed.
        </p>
        <p className="max-w-[64ch]">Job listings come from employers&apos; public job boards and Google Jobs. Deis is not affiliated with any employer, LinkedIn or Google. Information about permits is general, not immigration advice.</p>
      </section>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete everything?">
        <p className="text-ink-2">Your profile, every application and kit, and your model settings will be removed from this device. This can&apos;t be undone. Download a backup first if you might want them.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Keep my data
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              await deleteEverything();
              history.replaceState(null, "", "/");
              location.reload();
            }}
          >
            Delete everything
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
