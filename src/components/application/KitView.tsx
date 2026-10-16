"use client";

import type { Application, Kit } from "@/lib/client/db";
import type { Fact } from "@/lib/profile/types";
import { CircleDashed } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useState } from "react";
import { Button, Elapsed, MOTION, Notice, Tabs, useMotion } from "../ui";
import { AnswersView } from "./AnswersView";
import { ChecksPanel } from "./ChecksPanel";
import { PART_COPY } from "./copy";
import { CvSheet } from "./CvSheet";
import { LetterView } from "./LetterView";
import { CheckRow, type useKitReveal } from "./reveal";
import { CvToolbar, LetterToolbar } from "./Toolbar";
import { failedParts } from "./trace";

// The kit's left pane: notices, then CV / Letter / Answers / Checks as a segmented pill
// tablist. A part Gemma couldn't write keeps its tab, marked with a warn glyph, with
// "Write it again" (CH-10).

/** A part that wasn't written: a small warn glyph in its tab. */
const notWrittenBadge = (
  <span className="inline-flex text-warn">
    <CircleDashed size={14} weight="bold" aria-hidden />
    <span className="sr-only">, not written</span>
  </span>
);

export type KitTab = "cv" | "letter" | "answers" | "checks";

export function KitView({
  app,
  kit,
  facts,
  name,
  tab,
  onTab,
  stale,
  rewrite,
  canRewrite,
  reveal,
}: {
  app: Application;
  kit: Kit;
  facts: Map<string, Fact>;
  name: string;
  tab: KitTab;
  onTab: (t: KitTab) => void;
  stale: boolean;
  rewrite: { busy: { since: number } | null; error: string | null; run: (recheck: boolean) => void };
  canRewrite: boolean;
  reveal: ReturnType<typeof useKitReveal>;
}) {
  const failed = failedParts(kit.errors);
  const missing = failed.filter((p) => (p === "letter" ? !kit.letter : p === "answers" ? !kit.answers : false));
  const again = (recheck = stale) =>
    canRewrite && !rewrite.busy ? (
      <Button size="sm" onClick={() => rewrite.run(recheck)}>
        Write it again
      </Button>
    ) : null;
  const notWritten = (part: "letter" | "answers") => (
    <Notice tone="warn" announce={false} title={`Gemma couldn't write the ${PART_COPY[part]} this time`} action={again()}>
      The rest of the kit is fine. Writing it again keeps this kit until the new one is ready.
    </Notice>
  );
  const job = { company: app.job.company, title: app.job.title };

  const items = [
    {
      id: "cv",
      label: "CV",
      content: (
        <div className="grid gap-1">
          <CvToolbar kit={kit} job={job} name={name} />
          <CheckRow kit={kit} playing={reveal.playing} run={reveal.run} total={reveal.total} replay={reveal.replay} canReplay={reveal.canReplay} />
          <div className={`mt-2 transition-opacity duration-150 ${reveal.hidden ? "opacity-0" : ""}`}>
            <CvSheet cv={kit.cv} />
          </div>
        </div>
      ),
    },
    ...(kit.letter || missing.includes("letter")
      ? [
          {
            id: "letter",
            label: "Letter",
            badge: kit.letter ? undefined : notWrittenBadge,
            content: kit.letter ? (
              <div className="grid gap-1">
                <LetterToolbar kit={kit} job={job} name={name} />
                <LetterView letter={kit.letter} title={app.job.title} name={name} />
              </div>
            ) : (
              notWritten("letter")
            ),
          },
        ]
      : []),
    ...(kit.answers || missing.includes("answers")
      ? [
          {
            id: "answers",
            label: "Answers",
            badge: kit.answers ? undefined : notWrittenBadge,
            content: kit.answers ? <AnswersView answers={kit.answers} /> : notWritten("answers"),
          },
        ]
      : []),
    {
      id: "checks",
      label: "Checks",
      badge: kit.events.length ? (
        <span className="num font-mono text-[12px] opacity-70">
          {kit.events.length}
          <span className="sr-only"> removed</span>
        </span>
      ) : undefined,
      content: <ChecksPanel kit={kit} facts={facts} />,
    },
  ];

  // Tab content slides in from the side of the tab you came from (MAGIC moment 5).
  const { reduce, t } = useMotion();
  const current = items.some((i) => i.id === tab) ? tab : "cv";
  const at = items.findIndex((i) => i.id === current);
  const [last, setLast] = useState({ at, dir: 1 });
  const dir = last.at === at ? last.dir : at > last.at ? 1 : -1;
  if (last.at !== at) setLast({ at, dir });
  const slid = items.map((i) => ({
    ...i,
    content: (
      <motion.div initial={reduce ? false : { x: dir * 20 }} animate={{ x: 0 }} transition={t(MOTION.spring)}>
        {i.content}
      </motion.div>
    ),
  }));

  return (
    <div className="grid min-w-0 gap-4">
      {rewrite.busy && (
        <Notice>
          Writing it again. This kit stays until the new one is ready. <Elapsed since={rewrite.busy.since} />
        </Notice>
      )}
      {rewrite.error && <Notice tone="error">{rewrite.error}</Notice>}
      {!rewrite.busy && missing.length > 0 && (
        <Notice tone="warn" announce={false} action={again()}>
          Gemma couldn&apos;t write the {missing.map((p) => PART_COPY[p]).join(" or the ")} this time.
        </Notice>
      )}
      {!rewrite.busy && stale && !missing.length && (
        <Notice tone="warn" announce={false} action={again(true)}>
          This kit was checked by an older version of Deis&apos;s rules, so some checks may be out of date. Write it again to check it with the current ones.
        </Notice>
      )}
      <Tabs label="Your application kit" value={current} onChange={(id) => onTab(id as KitTab)} items={slid} className="min-w-0" panelClassName="pt-3" />
    </div>
  );
}
