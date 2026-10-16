// Employers with Irish roles on a public job board API: free to read, no key, full
// job descriptions, and no cost per user, so the more the better. The first 30 were
// checked on 13 Oct 2026; the rest on 16 Oct by probing ~500 slugs across the five
// APIs and keeping the ones listing at least two roles in the Republic (count then in
// the comment). Big boards are mostly senior or sales roles; the seniority filter sorts.
//
// To add an employer: find boards.greenhouse.io/<slug>, jobs.ashbyhq.com/<slug>,
// jobs.lever.co/<slug> or jobs.smartrecruiters.com/<CompanyId> on their careers page
// and add a line.

export type Board = { ats: "greenhouse" | "ashby" | "lever" | "smartrecruiters"; slug: string; name: string };

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
  // Added 16 Oct (Irish roles that day)
  { ats: "greenhouse", slug: "klaviyo", name: "Klaviyo" }, // 12
  { ats: "greenhouse", slug: "sumup", name: "SumUp" }, // 12
  { ats: "greenhouse", slug: "virtu", name: "Virtu Financial" }, // 10
  { ats: "greenhouse", slug: "learnupon", name: "LearnUpon" }, // 6
  { ats: "greenhouse", slug: "abnormalsecurity", name: "Abnormal Security" }, // 4
  { ats: "greenhouse", slug: "hellofresh", name: "HelloFresh" }, // 4
  { ats: "greenhouse", slug: "wrike", name: "Wrike" }, // 4
  { ats: "greenhouse", slug: "reddit", name: "Reddit" }, // 3
  { ats: "greenhouse", slug: "tripadvisor", name: "Tripadvisor" }, // 3
  { ats: "greenhouse", slug: "launchdarkly", name: "LaunchDarkly" }, // 2
  { ats: "greenhouse", slug: "zscaler", name: "Zscaler" }, // 2
  { ats: "ashby", slug: "harvey", name: "Harvey" }, // 23
  { ats: "ashby", slug: "n8n", name: "n8n" }, // 20
  { ats: "ashby", slug: "ashby", name: "Ashby" }, // 13
  { ats: "ashby", slug: "vanta", name: "Vanta" }, // 10
  { ats: "ashby", slug: "docker", name: "Docker" }, // 5
  { ats: "ashby", slug: "pennylane", name: "Pennylane" }, // 4
  { ats: "ashby", slug: "astronomer", name: "Astronomer" }, // 2
  { ats: "lever", slug: "cartrawler", name: "CarTrawler" }, // 11
  { ats: "lever", slug: "veeva", name: "Veeva Systems" }, // 6
  { ats: "smartrecruiters", slug: "AbbVie", name: "AbbVie" }, // 68
  { ats: "smartrecruiters", slug: "Primark", name: "Primark" }, // 59
  { ats: "smartrecruiters", slug: "ServiceNow", name: "ServiceNow" }, // 14
  { ats: "smartrecruiters", slug: "Entain", name: "Entain" }, // 12
];
