import { totalmem } from "node:os";
import { localModels } from "@/mastra/model";

export const runtime = "nodejs";

// On the user's own machine: is Ollama running, and which Gemma models does it have?
// memoryGb lets the app turn "Better writing" (the 12B model writes the kit) on by default
// from 24 GB. The hosted demo never probes local addresses.
export async function GET() {
  if (process.env.DEIS_HOSTED === "1") return Response.json({ running: false, models: [], hosted: true });
  const models = await localModels();
  const memoryGb = Math.round(totalmem() / 1024 ** 3);
  if (!models) return Response.json({ running: false, models: [], memoryGb });
  return Response.json({ running: true, models: models.map((m) => ({ name: m.name, gb: Math.round((m.size / 1e9) * 10) / 10 })), memoryGb });
}
