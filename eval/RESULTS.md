# Eval results

## Seniority filter (code only, no model)

Does the deck show the right jobs to someone with 0 to 2 years of experience? Each posting is labelled by hand as **show** (graduate, intern, junior, or no level stated), **stretch** (asks for 2 years, or a level II title) or **hide** (3+ years, a senior title or a people-manager role). The filter is scored on the same three outcomes.

The costly mistake is hiding a job someone could get. Showing a senior job only costs a swipe.

| Set | Postings | First run | After fixes | Jobs wrongly hidden |
| --- | --- | --- | --- | --- |
| Tuning set (`postings.json`, real Irish postings from 30 employer boards and Google Jobs, 13 Oct 2026) | 81 | 70 right (86.4%) | 81 right (100%) | 0 then 0 |
| Held out, labelled blind before running the filter (`holdout*.json`) | 52 | 51 right (98.1%) | 52 right (100%) | **1** then 0 |

The 100% figures are after looking at the mistakes, so they flatter the filter. The honest number for postings it has never seen is the held-out first run: **98.1%**.

What the first runs got wrong, and what changed:

- "5+ years of demonstrated privacy **program** management" was ignored because "program" was on the list meant for "a 2-year graduate programme". Exclusions now look only at the words right next to the number.
- "8+ years in partnerships", "3+ years of hands-on Workday configuration": no "experience" word nearby. Requirement-style phrasing (a plus sign, a minimum or a range) now counts on its own.
- "Software Engineer 3" and "Manager, Sales Development" weren't read as senior. Numbered levels and "Manager, …" titles now are.
- "5+ years of enablement experience in software, ideally supporting customer success" was treated as optional because of "ideally" later in the line. Soft words now count only next to the number.
- **Held out:** "complete the ACA qualification over a period of 3 - 4 years" hid a *Trainee Accountant* job. Study periods no longer count, and a graduate, trainee or intern title can only be hidden by a line that actually says "experience".

Run them: `npx tsx eval/seniority.mts` and `npx tsx eval/seniority.mts holdout`.
