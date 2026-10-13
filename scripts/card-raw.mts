// What does Gemma actually return for a card? Prints the raw structured output.
import { PERSONAS } from "../src/lib/demo/personas";
import { modelChain } from "../src/mastra/model";
import { structured } from "../src/mastra/gemma";
import { cardPrompt } from "../src/lib/ai/prompts";
import { cardSchema } from "../src/lib/ai/schema";
import { fromGoogleJobs } from "../src/lib/jobs/normalise";
const job = fromGoogleJobs({ title: "Graduate Data Analyst", company_name: "Bank of Ireland", location: "Dublin, Ireland", description: "Join our data team. You will use SQL, Python and Power BI to build dashboards and analyse customer data. Recent graduates welcome.", apply_options: [{ title: "BOI", link: "https://example.ie/x" }] })!;
const r = await structured("card", "cardAgent", modelChain(process.argv[2] === "openai" ? { provider: "openai", baseUrl: "http://127.0.0.1:11434/v1", model: "gemma4:e4b" } : { provider: "ollama", baseUrl: "http://127.0.0.1:11434/api", model: "gemma4:e4b" }), cardPrompt(job, PERSONAS.rahul.facts), cardSchema, { maxOutputTokens: 500 });
console.log(JSON.stringify(r.data, null, 1));
