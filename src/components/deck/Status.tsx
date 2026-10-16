"use client";

import { Hammer, PauseCircle } from "@phosphor-icons/react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/client/db";
import { useKitQueue } from "../KitQueue";
import { BarList, Button, Dialog, Elapsed } from "../ui";
import type { HiddenBar } from "./logic";

// The deck's quiet status: the background kit queue as one line under the actions, and the
// hidden-for-you breakdown (PRD-9: bars, not a <details>) in a sheet behind the meta line's
// "365 hidden".

/** One line under the actions: what the Quick lane is building, or what swiping right will do. */
export function QueueLine({ lane }: { lane: "quick" | "careful" | null }) {
  const { working, since, waiting, paused } = useKitQueue();
  const app = useLiveQuery(() => (working ? db.applications.get(working) : undefined), [working]);
  const cls = "mx-auto mt-5 flex max-w-[460px] items-start justify-center gap-2 text-center text-caption";
  if (paused && waiting > 0)
    return (
      <p className={`${cls} text-warn`}>
        <PauseCircle size={16} weight="bold" aria-hidden className="mt-0.5 shrink-0" />
        <span>
          Kits paused, {waiting} waiting. {paused.message}
        </span>
      </p>
    );
  if (working)
    return (
      <p className={`${cls} text-ink-2`}>
        <Hammer size={16} weight="bold" aria-hidden className="mt-0.5 shrink-0" />
        <span>
          Building a kit{app ? ` for ${app.job.title}` : ""}
          {since && (
            <span className="font-mono text-[12px] text-ink-3">
              {" "}
              <Elapsed since={since} />
            </span>
          )}
          .{waiting > 1 && ` ${waiting - 1} more after this one.`}
        </span>
      </p>
    );
  const line = lane === "quick" ? "Apply builds a Quick kit in the background while you keep swiping." : lane === "careful" ? "Apply opens the Careful lane: the fit first, then your gaps." : "Apply asks how you want to apply, once.";
  return <p className={`${cls} text-ink-3`}>{line}</p>;
}

/** The sheet behind "365 hidden": what Deis hid, why, and the way to show stretch roles. */
export function HiddenDialog({ open, onClose, bars, canShowStretch, onShowStretch }: { open: boolean; onClose: () => void; bars: HiddenBar[]; canShowStretch: boolean; onShowStretch: () => void }) {
  const total = bars.reduce((s, b) => s + b.value, 0);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Hidden for you"
      description={`Deis hid ${total.toLocaleString("en-IE")} ${total === 1 ? "job" : "jobs"} that don't fit what you told it. Code decides this, not Gemma.`}
      footer={
        canShowStretch ? (
          <Button
            onClick={() => {
              onShowStretch();
              onClose();
            }}
          >
            Show stretch roles too
          </Button>
        ) : undefined
      }
    >
      <BarList items={bars.map((b) => ({ key: b.key, label: b.label, value: b.value, tone: b.tone }))} />
    </Dialog>
  );
}
