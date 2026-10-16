"use client";

import type { Kit } from "@/lib/client/db";
import { scrub } from "@/lib/cv/compose";
import type { Fact } from "@/lib/profile/types";
import { Notice } from "../ui";
import { RULE_COPY } from "./copy";
import { groupEvents } from "./trace";

// Everything the guard stepped in on, fit check included, grouped by rule (UX-7). Lines it
// kept by adding a source show that fact's text, never its id.

function Count({ n }: { n: number }) {
  return <span className="num inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-sunken px-2 font-mono text-[12px] font-medium text-ink-2">{n}</span>;
}

export function ChecksPanel({ kit, facts }: { kit: Kit; facts: Map<string, Fact> }) {
  const groups = groupEvents(kit.events);
  const repairs = kit.repairs ?? [];
  const n = kit.events.length;
  return (
    <div className="grid gap-6">
      <Notice tone={n ? "info" : "ok"} announce={false} title={n ? `Deis removed ${n} ${n === 1 ? "thing" : "things"} your facts don't back up` : "Nothing needed removing"}>
        {n ? "They're below, grouped by the rule that caught them, so you can see what a model would have claimed." : "Every line in this kit traces back to a fact you confirmed."}
      </Notice>
      {groups.map((g) => (
        <section key={g.rule} aria-labelledby={`rule-${g.rule}`} className="grid gap-2">
          <h3 id={`rule-${g.rule}`} className="flex items-center gap-2 text-body font-semibold text-ink">
            {RULE_COPY[g.rule] ?? g.rule}
            <Count n={g.items.length} />
          </h3>
          <ul className="divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface">
            {g.items.map((e, i) => (
              <li key={i} className="px-4 py-3 text-body text-ink-2">
                <span className="sr-only">Removed: </span>
                <s className="decoration-ink-3">{scrub(e.text)}</s>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {repairs.length > 0 && (
        <section aria-labelledby="repairs" className="grid gap-2">
          <h3 id="repairs" className="flex items-center gap-2 text-body font-semibold text-ink">
            Kept by adding a source
            <Count n={repairs.length} />
          </h3>
          <p className="max-w-[64ch] text-body text-ink-2">
            Deis kept {repairs.length === 1 ? "this line" : `these ${repairs.length} lines`} by adding one more of your facts as {repairs.length === 1 ? "its source" : "their source"}. Check{" "}
            {repairs.length === 1 ? "it says" : "they say"} only what that fact says.
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface">
            {repairs.map((r, i) => {
              const added = r.ids.map((id) => facts.get(id)?.text).filter(Boolean);
              return (
                <li key={i} className="grid gap-1.5 px-4 py-3 text-body text-ink">
                  {scrub(r.text)}
                  {added.length > 0 && (
                    <span className="text-caption text-ink-2">
                      Added source: <span className="highlight text-ink" data-on>{added.join("; ")}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <p className="max-w-[64ch] text-caption text-ink-3">
        Code checks numbers, tools, certificates, employers and dates. It can&apos;t judge every shade of meaning, so read the CV once before you send it. The numbers in the CV&apos;s margin show the fact behind each line.
      </p>
    </div>
  );
}
