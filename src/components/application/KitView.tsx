"use client";

import type { Application, Kit } from "@/lib/client/db";
import type { Fact } from "@/lib/profile/types";
import { Button, Elapsed, Notice, Pill, Tabs } from "../ui";
import { AnswersView } from "./AnswersView";
import { ChecksPanel } from "./ChecksPanel";
import { PART_COPY } from "./copy";
import { CvSheet } from "./CvSheet";
import { LetterView } from "./LetterView";
import { CvToolbar, LetterToolbar } from "./Toolbar";
import { failedParts } from "./trace";

// The kit's left pane: notices, then CV / Letter / Answers / Checks as accessible tabs. A
// part Gemma couldn't write keeps its tab, with "Write it again" (CH-10).

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
        <div className="grid gap-2">
          <CvToolbar kit={kit} job={job} name={name} />
          <CvSheet cv={kit.cv} />
        </div>
      ),
    },
    ...(kit.letter || missing.includes("letter")
      ? [
          {
            id: "letter",
            label: "Cover letter",
            badge: kit.letter ? undefined : <Pill tone="ochre">Not written</Pill>,
            content: kit.letter ? (
              <div className="grid gap-2">
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
            label: "Form answers",
            badge: kit.answers ? undefined : <Pill tone="ochre">Not written</Pill>,
            content: kit.answers ? <AnswersView answers={kit.answers} /> : notWritten("answers"),
          },
        ]
      : []),
    {
      id: "checks",
      label: "Checks",
      badge: kit.events.length ? <Pill>{kit.events.length}</Pill> : undefined,
      content: <ChecksPanel kit={kit} facts={facts} />,
    },
  ];

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
      <Tabs label="Your application kit" value={items.some((i) => i.id === tab) ? tab : "cv"} onChange={(id) => onTab(id as KitTab)} items={items} className="min-w-0" panelClassName="pt-2" />
    </div>
  );
}
