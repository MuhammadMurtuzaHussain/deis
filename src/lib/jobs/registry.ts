// Employers with Irish roles on a public job board API: free to read, no key, full
// job descriptions. Checked on 13 Oct 2026 with scripts/registry.mts, which keeps
// only boards that resolve and list at least one role in Ireland. Big boards are
// mostly senior or sales roles; the seniority filter does the sorting.
//
// To add an employer: find their careers page, look for boards.greenhouse.io/<slug>
// or jobs.ashbyhq.com/<slug>, add a line, run `pnpm registry`.

export type Board = { ats: "greenhouse" | "ashby"; slug: string; name: string };

export const BOARDS: Board[] = [
  { ats: "greenhouse", slug: "stripe", name: "Stripe" },
  { ats: "greenhouse", slug: "mongodb", name: "MongoDB" },
  { ats: "greenhouse", slug: "intercom", name: "Intercom" },
  { ats: "greenhouse", slug: "elastic", name: "Elastic" },
  { ats: "greenhouse", slug: "datadog", name: "Datadog" },
  { ats: "greenhouse", slug: "toast", name: "Toast" },
  { ats: "greenhouse", slug: "twilio", name: "Twilio" },
  { ats: "greenhouse", slug: "okta", name: "Okta" },
  { ats: "greenhouse", slug: "gitlab", name: "GitLab" },
  { ats: "greenhouse", slug: "anthropic", name: "Anthropic" },
  { ats: "greenhouse", slug: "squarespace", name: "Squarespace" },
  { ats: "greenhouse", slug: "pinterest", name: "Pinterest" },
  { ats: "greenhouse", slug: "tines", name: "Tines" },
  { ats: "greenhouse", slug: "monzo", name: "Monzo" },
  { ats: "greenhouse", slug: "asana", name: "Asana" },
  { ats: "greenhouse", slug: "airbnb", name: "Airbnb" },
  { ats: "greenhouse", slug: "grafanalabs", name: "Grafana Labs" },
  { ats: "greenhouse", slug: "flipdish", name: "Flipdish" },
  { ats: "greenhouse", slug: "dropbox", name: "Dropbox" },
  { ats: "greenhouse", slug: "udemy", name: "Udemy" },
  { ats: "greenhouse", slug: "riotgames", name: "Riot Games" },
  { ats: "greenhouse", slug: "databricks", name: "Databricks" },
  { ats: "greenhouse", slug: "deliveroo", name: "Deliveroo" },
  { ats: "greenhouse", slug: "newrelic", name: "New Relic" },
  { ats: "greenhouse", slug: "coinbase", name: "Coinbase" },
  { ats: "ashby", slug: "openai", name: "OpenAI" },
  { ats: "ashby", slug: "notion", name: "Notion" },
  { ats: "ashby", slug: "elevenlabs", name: "ElevenLabs" },
  { ats: "ashby", slug: "wayflyer", name: "Wayflyer" },
  { ats: "ashby", slug: "perplexity", name: "Perplexity" },
];
