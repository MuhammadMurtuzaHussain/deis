import type { GuardRule } from "@/lib/cv/guard";
import type { KitPart } from "./trace";

// The words the kit workspace uses for the guard's rules, kit parts and fit verdicts.

export const RULE_COPY: Record<GuardRule, string> = {
  uncited: "No fact behind it",
  unknown_fact: "Pointed at a fact that doesn't exist",
  unsupported_number: "A number that isn't in your facts",
  unsupported_tool: "A tool that isn't in your facts",
  unsupported_cert: "A certificate you don't list",
  years_claim: "A total years of experience",
  never_claim: "On your never-say list",
  wrong_employer: "Put under the wrong job",
  first_person: "Written as “I” on a CV",
  unsupported_skill: "A skill you don't list",
  fit_demoted: "A claimed match with nothing behind it",
  past_as_present: "Said you're still studying a finished degree",
  work_status: "A claim about your visa or right to work",
  added_claim: "Claimed more than your facts say",
  posting_copy: "Copied from the job posting",
};

export const PART_COPY: Record<KitPart, string> = { cv: "CV", letter: "cover letter", answers: "form answers" };

export const VERDICT: Record<string, string> = { close: "Close fit", good: "Good fit", stretch: "A stretch, worth a go", major_stretch: "A big stretch" };

/** Save a Blob as a file. */
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
