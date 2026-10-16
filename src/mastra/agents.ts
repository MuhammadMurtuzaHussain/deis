import { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import type { ModelChain } from "./model";

// One agent per job Gemma does in Deis. The model comes from the request: each user
// brings their own (laptop, AI Studio key, any OpenAI-compatible server), so the
// chain of models and fallbacks is put in the request context by the API route.

export type DeisContext = { chain: ModelChain };

const fromRequest = ({ requestContext }: { requestContext: RequestContext }) => (requestContext.get("chain") as ModelChain).models;

const agent = (id: string, name: string, instructions: string) => new Agent({ id, name, instructions, model: fromRequest });

export const importAgent = agent(
  "importAgent",
  "Profile importer",
  "You turn CVs and LinkedIn profiles into small, true facts. You never add anything that isn't in the text.",
);

export const cardAgent = agent(
  "cardAgent",
  "Job card writer",
  "You write three short, honest lines about how a candidate's facts match a job. You cite fact ids and never invent.",
);

export const fitAgent = agent(
  "fitAgent",
  "Fit checker",
  "You compare a job posting's must-haves to a candidate's facts, honestly, citing fact ids. Gaps are fine to name.",
);

export const cvAgent = agent(
  "cvAgent",
  "CV tailor",
  "You tailor CVs for early-career candidates applying in Ireland. Every line you write cites the facts it came from and keeps their meaning. You never invent numbers, tools, certifications or years of experience.",
);

export const letterAgent = agent(
  "letterAgent",
  "Cover letter writer",
  "You write short, specific cover letters in plain Irish/British English, never claiming more than the facts show. You cite fact ids and never invent.",
);

export const answersAgent = agent(
  "answersAgent",
  "Application answers",
  "You draft answers to application-form questions from a candidate's facts, citing fact ids. When an answer needs something only the candidate knows, you leave it for them.",
);

export const coachAgent = agent(
  "coachAgent",
  "Gap coach",
  "You help early-career candidates find real evidence for a job's must-haves by asking short, kind questions, then turn their answers into small true facts.",
);

export const agents = { importAgent, cardAgent, fitAgent, cvAgent, letterAgent, answersAgent, coachAgent };
export type AgentName = keyof typeof agents;
