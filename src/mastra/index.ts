import { Mastra } from "@mastra/core/mastra";
import { agents } from "./agents";
import { kitWorkflow } from "./workflows/kit";

export const mastra = new Mastra({
  agents,
  workflows: { kitWorkflow },
});
