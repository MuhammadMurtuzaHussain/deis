"use client";

import { DownloadSimple, Trash, UploadSimple } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { deleteEverything, exportAll, importAll } from "@/lib/client/db";
import { saveFile } from "@/lib/client/files";
import { Button, Dialog, Notice } from "../ui";
import { SettingsSection } from "./parts";

// The user's own data: a JSON backup, restoring one, and deleting everything in one go.

export function DataSection({ desktop }: { desktop: boolean }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const download = async () => {
    await saveFile(new Blob([JSON.stringify(await exportAll(), null, 2)], { type: "application/json" }), `deis-backup-${new Date().toISOString().slice(0, 10)}.json`);
  };

  return (
    <SettingsSection
      title="Your data"
      description={`Your profile, applications and kits live only in ${desktop ? "this app" : "this browser"}. There's no account and no copy on a server. Make a backup before you clear your browser or move computer.`}
    >
      <div className="flex flex-wrap gap-2">
        <Button onClick={download}>
          <DownloadSimple size={18} aria-hidden />
          Download a backup
        </Button>
        <Button onClick={() => fileRef.current?.click()}>
          <UploadSimple size={18} aria-hidden />
          Restore a backup
        </Button>
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          <Trash size={18} aria-hidden />
          Delete everything
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
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

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete everything?"
        footer={
          <>
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
          </>
        }
      >
        <p className="text-body text-ink-2">Your profile, every application and kit, and your model settings will be removed from this device. This can&apos;t be undone. Download a backup first if you might want them.</p>
      </Dialog>
    </SettingsSection>
  );
}
