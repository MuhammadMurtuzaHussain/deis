import type { Application } from "@/lib/client/db";
import { cvSections } from "@/lib/cv/compose";

// "Used in N CV lines": how many lines across every stored kit cite each fact. Counted
// from the same cvSections() the sheet and the Word file render, so old kits count too.

export function factUsage(apps: Pick<Application, "kit">[]): Map<string, number> {
  const uses = new Map<string, number>();
  const add = (ids: string[] | undefined) => {
    // A line citing the same fact twice still counts once.
    for (const id of new Set(ids ?? [])) uses.set(id, (uses.get(id) ?? 0) + 1);
  };
  for (const a of apps) {
    if (!a.kit?.cv) continue;
    for (const s of cvSections(a.kit.cv)) {
      if (s.id === "header") continue;
      for (const l of s.paragraph ?? []) add(l.facts);
      for (const l of s.bullets ?? []) add(l.facts);
      for (const e of s.entries ?? []) {
        if (e.facts.length) add(e.facts);
        for (const l of e.lines) add(l.facts);
      }
    }
  }
  return uses;
}
