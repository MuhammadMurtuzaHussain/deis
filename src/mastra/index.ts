import { MastraLogger } from "@mastra/core/logger";
import { Mastra } from "@mastra/core/mastra";
import { agents } from "./agents";
import { kitWorkflow } from "./workflows/kit";

/** Text before the first detail: Mastra's own messages can carry a model's raw output, which holds a CV. */
const headline = (message: string) => message.split(/[:\n{[]/)[0].trim().slice(0, 120);

/** Mastra's console logger prints raw model output when a schema check fails. This one keeps the headline only. */
class HeadlineLogger extends MastraLogger {
  debug() {}
  info() {}
  warn(message: string) {
    console.warn("[mastra]", headline(message));
  }
  error(message: string) {
    console.error("[mastra]", headline(message));
  }
}

export const mastra = new Mastra({
  agents,
  workflows: { kitWorkflow },
  logger: new HeadlineLogger({ name: "deis" }),
});
