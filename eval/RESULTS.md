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

## The CV guard (Gemma writes, code checks)

The real fit check and kit workflow (CV, cover letter, form answers) for both fictional personas against 8 early-career postings from the snapshot, on **Gemma 4 E4B through Ollama on a MacBook** (13 Oct 2026). For every kit: what the guard removed, by rule, and an independent re-check of the finished CV. Every number, tool and certificate must appear in the persona's confirmed facts.

| Run | Sentences kept | Removed by the guard | What it removed | Untraceable after the guard | Median time per kit |
| --- | --- | --- | --- | --- | --- |
| First run | 210 | 56 (21%) | 44 lines citing a fact by quoting it or by its label instead of its id; 12 tools not in the facts | **0** | 46 s |
| After citation repair | 261 | 11 (4%) | 6 tools, 2 "currently studying" a finished degree, 1 number, 1 skill, 1 uncited line | **0** | 50 s |

- The first run showed the small model never invented ids. Instead it cited facts by quoting them or by their label ("achievement · Harbour Payments"). Those quotes and labels are now matched back to the facts they name, and prompts put the id first. The guard went from throwing away most good lines to removing mostly over-claims. Not only those: reading the kits by hand on 15 October found true sentences dropped because the model cited too little, including a letter's honest sentence naming a gap. The 16 October section below counts removals by rule and keeps the removed text, so they can be read.
- In both runs, nothing the independent check could trace was left unsupported.
- What code can't check is meaning. In an earlier manual run a competency called a solo final-year project "multi-person". That's why the kit can show the source facts under every line.

Tokens per kit (fit + CV + letter + answers): about **7,700 in and 2,500 out**. On a laptop that costs nothing beyond electricity; on Google AI Studio's free tier it costs nothing; at a reseller's Gemma 4 26B price ($0.06 per million input tokens, $0.33 per million output) it's about **$0.0013 per application**, or roughly $0.65 for 500.

Run it: `pnpm eval ollama 4` (needs `ollama pull gemma4:e4b`). Raw results are in `eval/results/`.

## Kit writing quality (16 Oct 2026)

The guard proves the kit invents nothing it can check; it says nothing about whether the CV reads well. So `eval/run.mts` now saves every kit in full (card, fit, CV, letter, answers and each guard removal with its text) and measures the writing too. Same 8 runs as above: both fictional personas, 4 early-career postings each from the snapshot, **Gemma 4 E4B through Ollama on a 16 GB MacBook**, Quick lane.

"Before" is the code of 15 October (the run is saved, and its metrics were recomputed with `npx tsx eval/run.mts metrics <file>`). "After" is the same postings with the new prompts, the graduate CV layout, the new guard rules and the code-owned form questions.

| Per kit, 8 kits | Before | After |
| --- | --- | --- |
| Facts cited on 3 or more CV lines | 3.5 | **0** |
| Near-copy line pairs on the CV (shared words > 0.45) | 2.4 | **0** |
| Share of cited facts used on 2 or more lines | 71% | 39% |
| Leaked prompt text (`[posting]`, `(needsYou: …)`) | 24 in 6 kits | **0** |
| A finished degree written as current ("Final year student", "current MSc") | 3 | 2 |
| 5-word runs copied from the posting: CV, letter, answers | 0.2%, 0.4%, 1.5% | 0.5%, 0.5%, 0.5% |
| Letters naming a gap | 1 of 8 | 0 of 8 (by design in the Quick lane, see below) |
| Words: CV, letter, answer (the CV is shorter partly because code drops repeats) | 286, 205, 59 | 139, 159, 51 |
| Sentences the guard removed | 7 of 277 (2.5%) | 15 of 212 (7.1%) |
| Untraceable numbers, tools or certificates left: CV, letters and answers | 0, 0 | 0, 0 |
| Sentences kept because the guard added a citation (read by hand) | 0 | 3 |
| Median time per kit (card, fit, kit) | 65 s | 50 s |

Two corrections after a review of this table on 16 October. The first version said 2 and 0 for tense: the eval's own pattern missed "my current studies in MSc Data Analytics" (Rahul, Pinterest answer) and "current MSc in Data Analytics" (Rahul, ESB letter), so both stayed in the after kits. The guard now catches both, and the eval's pattern does too. The untraceable check first covered only the CV; it now covers letters and answers as well, allowing the posting's years and durations and tools named in a sentence admitting a gap. It checks against the whole profile, not each line's own facts, so a line that borrows a number or verb from another fact passes it. That is why repaired citations are now counted: one of the 3 was the ESB letter's "managing duties at Corrib Grocers", kept by borrowing "managers" from a Lantern Logistics fact. The guard no longer repairs led, managed and the like, and a repair now needs one fact that backs the whole sentence.

CV order before: profile, core competencies, experience, projects, education, skills, achievements, languages. After, for a graduate: **profile, education (with the grade under the degree), experience, projects and leadership, skills, certifications, languages**, with the employer that matches the posting's hard skills first.

What changed, in the kits themselves:

- **Tense.** Before, for Aoife (BSc 2022 – 2026) and Stripe: "Final year student completing a BSc Computer Science at University College Dublin." Her MongoDB letter said: "My academic studies at University College Dublin are ongoing; I am currently in my final year and expect to graduate in Summer 2028." After: "Computer Science graduate applying for Software Engineer, Intern (Summer or Winter) at Stripe."
- **Repeats.** Before, Aoife's dashboard fact appeared three times on one CV: in the summary, as a competency ("Building Production Software: Constructed an internal dashboard…") and as a bullet. After, the profile is 2 or 3 sentences, key skills are short labels, and code drops any later line whose facts are already on the page or that nearly repeats one.
- **Leaks.** Before: "I am drawn to Stripe's focus on building programmable financial infrastructure to improve economic growth and prosperity [posting]." and the question "What are your salary expectations? (needsYou: true, leave answer empty)". After, code writes the five questions and a last scrub removes bracketed scaffolding from every field.

What the metrics don't catch, from reading all 8 after kits:

- The guard removed 15 sentences. 8 were real over-claims or posting copy ("You have direct proficiency in Python and Javascript/React" for someone who lists TypeScript, "managing customer duties", "Stripe's mission to increase the GDP of the internet"). 2 were empty headings ("Data structures and algorithms:"). 5 were true or harmless: two forward-looking closing lines with no fact cited ("I am keen to learn how large-scale ML systems are developed…"), two true skill lines that cited too little ("Demonstrates technical competence using Python, TypeScript, and React…"), and "I am interested in MongoDB because…", where the guard read the employer's name as a tool claim. So not every removal is a real over-claim: 8 of 15 were, and the empty headings were rightly dropped.
- "Why do you want to work at …" answers still paraphrase the company's own pitch ("processing trillions of dollars a year") in runs shorter than the 7-word copy rule.
- Letters are shorter than the 200-280 words asked for (135-187), all open with the candidate's project, one opened "For instance," after the guard dropped the sentence before it, and one ended "Sincerely," before code added its own sign-off. Code now removes the model's greeting, sign-off and a dangling opening link word.
- The Quick lane doesn't name gaps on purpose: those gaps come from facts the user hasn't added, not from things they lack. The Careful lane asks first, and its letters may name a confirmed gap (`EVAL_LANE=careful`).
- 39% of cited facts still appear twice, nearly always once in the profile and once as a bullet, which is what a profile is for.
- Card "why" lines are now guarded like CV lines and Gemma no longer writes a score; code derives one from how many lines stand on facts (it was never shown, and is 50 for a normal strong, transferable and gap card).

**Careful lane** (`EVAL_LANE=careful`, e4b, 1 posting per persona). Aoife's Stripe letter named its one confirmed gap honestly: "I haven't yet used AI tools while applying critical judgment to validate outputs, but I am ready to learn this." Rahul's gap sentence was removed: it said "I am continuing my MSc Data Analytics studies" (finished in 2025), and the guard also read its "big data technologies like Hadoop or Spark" as a tool claim, because the "haven't" sits more than 6 words before the tool name. A true version of that sentence would have been removed too.

**E4B against 12B for the kit** (`EVAL_KIT_MODEL=gemma4:12b`: e4b still writes the card and fit). The same 4 postings, 2 per persona:

| 4 kits | E4B writes the kit | 12B writes the kit |
| --- | --- | --- |
| Sentences removed by the guard | 5 of 101 (5.0%) | 5 of 109 (4.6%) |
| Leaks, tense errors, untraceable claims | 0, 1, 0 | 0, 0, 0 |
| Facts cited in the "Why this company" answer | 1 to 2 | 2 to 3 |
| Words: CV, letter, answer | 139, 153, 53 | 124, 140, 74 |
| Median time per kit (card, fit, kit) | 50 s | 98 s |

On these 4, 12B's answers tie the company to the candidate's own work more often ("My experience building a dashboard for card payments at Harbour Payments gave me a firsthand look at…"), and its profiles are shorter. The safety numbers are the same. Four kits is too few to call it, and it takes twice as long. The model settings can already send the kit to 12B (`kitModel`) while e4b keeps the card and fit; a "Better writing" switch in Settings is still to come.

Run it: `pnpm eval ollama 4`. `EVAL_KIT_MODEL=gemma4:12b` writes the kit with the bigger local model. The saved runs are `eval/results/kit-ollama-2026-10-16-*.json` (`before`, two drafts of the new prompts, `after-e4b`, `after-e4b-careful`, `after-12b-kit`).
