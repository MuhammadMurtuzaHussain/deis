"use client";

import type { Preferences } from "@/lib/profile/types";
import { categoriesForTitle, categoryById } from "@/lib/jobs/categories";
import type { DeckEntry } from "@/lib/jobs/rank";
import { WORK_FIT_COPY, WORK_STATUS_LABEL } from "@/lib/jobs/rightToWork";
import { postedAgo } from "../JobCard";

// "Why you're seeing this", inside the card (it replaced the deck's inspector column).
// Every line is code's reasoning: the filters that let the job through, the right-to-work
// line for the user's own status (PRD-9), and pay, dates and where the job came from.
// Nothing here comes from Gemma.

const SOURCE: Record<DeckEntry["job"]["source"], string> = {
  greenhouse: "The company's own job board",
  ashby: "The company's own job board",
  lever: "The company's own job board",
  smartrecruiters: "The company's own job board",
  google_jobs: "Google Jobs",
  pasted: "Pasted by you",
};

/** Code's reasons this job is in the deck. */
export function reasons(entry: DeckEntry, prefs: Preferences): string[] {
  const { job } = entry;
  const out: string[] = [];
  if (job.source === "pasted") out.push("You added it, so it skips the filters.");
  out.push(
    { early: "It's an early-career role.", open: "It doesn't ask for a level or years.", stretch: "It asks for about 2 years: a stretch.", senior: "It's a senior role." }[job.seniority.level],
  );
  if (job.city === "Ireland") out.push("The posting doesn't say where in Ireland.");
  else if (job.remote && prefs.remoteOk && !prefs.cities.includes(job.city)) out.push("It can be done remotely, which you're open to.");
  else if (prefs.cities.includes(job.city)) out.push(`It's in ${job.city}, one of your places.`);
  const kinds = categoriesForTitle(job.title).filter((c) => prefs.roles.includes(c));
  if (kinds.length) out.push(`It's ${kinds.map((c) => categoryById(c)?.label.toLowerCase() ?? c).join(" and ")} work, as you asked.`);
  if (entry.matched.length) out.push(`It shares ${entry.matched.length} ${entry.matched.length === 1 ? "word" : "words"} with your profile: ${entry.matched.slice(0, 6).join(", ")}.`);
  return out;
}

/** The disclosure's body for one deck entry. */
export function WhyShown({ entry, prefs }: { entry: DeckEntry; prefs: Preferences }) {
  const { job } = entry;
  const status = prefs.workStatus;
  const posted = job.source === "pasted" ? "Added by you" : (postedAgo(job.postedAt) ?? "Not stated");
  return (
    <div className="grid gap-4 text-body">
      <ul className="grid gap-1.5 text-ink">
        {reasons(entry, prefs).map((r) => (
          <li key={r} className="grid grid-cols-[12px_1fr] gap-2">
            <span aria-hidden className="mt-[0.7em] h-px w-2.5 bg-ink-3" />
            {r}
          </li>
        ))}
      </ul>
      {/* PRD-9: always a line for the user's own status, even when the posting says nothing. */}
      <p className={entry.work === "check" ? "text-warn" : "text-ink-2"}>
        {job.rightToWork.stance === "unknown" ? "Doesn't mention permits. Most postings don't." : `${WORK_FIT_COPY[job.rightToWork.stance]}.`}
        {status && <> Your status: {WORK_STATUS_LABEL[status].replace(/^I'll need/, "needs")}.</>}
        {entry.work === "check" && " Check this fits your stamp."}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1">
        <dt className="text-ink-3">Pay</dt>
        <dd className="text-ink">{job.salary ?? "Not stated"}</dd>
        <dt className="text-ink-3">Posted</dt>
        <dd className="text-ink">{posted}</dd>
        <dt className="text-ink-3">From</dt>
        <dd className="text-ink">{SOURCE[job.source]}</dd>
      </dl>
    </div>
  );
}
