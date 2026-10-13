import type { RightToWork, WorkStance } from "./types";

// What a posting says about permission to work in Ireland, found by code and quoted
// on the card. This is information, not immigration advice: the card links to the
// official pages and the user decides.

export const WORK_STATUSES = ["eu", "stamp4", "stamp1g", "permit"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  eu: "Irish, EU, EEA, Swiss or UK citizen",
  stamp4: "Stamp 4 or another open permission",
  stamp1g: "Stamp 1G (graduate)",
  permit: "I'll need an employment permit",
};

const RULES: { stance: WorkStance; re: RegExp }[] = [
  {
    stance: "sponsors",
    re: /\b(visa|permit|work permit|employment permit)\s+sponsorship\s+(is\s+)?(available|provided|offered|possible)|\bwe\s+(can|will|are able to)\s+sponsor\b|\b(critical skills|general employment)\s+(employment\s+)?permit\s+(support|sponsorship|available)|\bsponsorship\s+(is\s+)?(available|provided|offered)\b/i,
  },
  {
    stance: "eu_only",
    re: /\b(eu|eea|european union|irish)\s*(\/\s*eea\s*)?(citizens?|nationals?|passport holders?)\s+only\b|\bonly\s+(eu|eea|irish)\s+(citizens?|nationals?)\b|\bstamp\s*4\s+(only|required|essential)\b|\brequire[sd]?\s+(a\s+)?stamp\s*4\b/i,
  },
  {
    stance: "no_sponsorship",
    re: /\b(no|not\s+(able|in a position)\s+to\s+(offer|provide)|unable\s+to\s+(offer|provide|support)|cannot\s+(offer|provide|support)|can['’]?t\s+(offer|provide|support)|will\s+not\s+(offer|provide|support)|won['’]?t\s+(offer|provide|support)|do(es)?\s+not\s+(offer|provide|support))\s+(any\s+)?(visa\s+|work\s+permit\s+|employment\s+permit\s+|immigration\s+)?sponsorship\b|\bwithout\s+(the\s+need\s+for\s+)?(current\s+or\s+future\s+)?(visa\s+|permit\s+|employer\s+)?sponsorship\b|\bsponsorship\s+(is\s+)?not\s+(available|offered|provided|possible)\b/i,
  },
  {
    stance: "right_to_work",
    re: /\b(must|should|will need to)\s+(already\s+)?(have|hold|possess)\s+(the\s+|full\s+|valid\s+|an?\s+)?(right|eligibility|authori[sz]ation|permission|entitlement)\s+to\s+work\s+in\s+(ireland|the eu|the eea|europe)\b|\beligib(le|ility)\s+to\s+work\s+in\s+(ireland|the eu|the eea)\b|\b(right|authori[sz]ed|permitted)\s+to\s+work\s+in\s+(ireland|the eu|the eea)\b/i,
  },
];

function quote(text: string, index: number, length: number): string {
  const start = Math.max(text.lastIndexOf(". ", index) + 1, text.lastIndexOf("\n", index) + 1, index - 80, 0);
  const ends = [text.indexOf(". ", index + length), text.indexOf("\n", index + length)].filter((i) => i >= 0);
  const end = Math.min(ends.length ? Math.min(...ends) + 1 : text.length, index + length + 80);
  return text.slice(start, end).replace(/^[\s•\-–*]+/, "").trim();
}

export function readRightToWork(description: string): RightToWork {
  for (const { stance, re } of RULES) {
    const m = re.exec(description);
    if (m) return { stance, evidence: quote(description, m.index, m[0].length) };
  }
  return { stance: "unknown", evidence: null };
}

export type WorkFit = "ok" | "check" | "blocked";

/**
 * Does this stance fit the user? A Stamp 1G holder already has the right to work, so
 * "must have the right to work in Ireland" is fine; "no sponsorship" is fine for now
 * but means no permit when Stamp 1G runs out, so it's a "check".
 */
export function workFit(stance: WorkStance, status: WorkStatus | null): WorkFit {
  if (!status || status === "eu") return "ok";
  switch (stance) {
    case "sponsors":
    case "unknown":
      return "ok";
    case "right_to_work":
      return status === "permit" ? "check" : "ok";
    case "no_sponsorship":
      return status === "permit" ? "blocked" : status === "stamp1g" ? "check" : "ok";
    case "eu_only":
      // "Stamp 4 required" suits a Stamp 4 holder; "EU citizens only" doesn't. The quote tells them which.
      return status === "stamp4" ? "check" : "blocked";
  }
}

export const WORK_FIT_COPY: Record<WorkStance, string> = {
  sponsors: "Says it can sponsor a permit",
  no_sponsorship: "Says it won't sponsor a permit",
  eu_only: "Limits who can apply by citizenship or stamp",
  right_to_work: "Asks for the right to work in Ireland",
  unknown: "Doesn't mention permits",
};
