import { totalmem } from "node:os";
import { z } from "zod";
import { body, jsonError } from "@/lib/server/api";
import { localModels, pullLocalModel } from "@/mastra/model";

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

// Ollama's model names: "gemma4:e4b", "library/gemma3:12b-it-qat". Nothing that could be a path or a URL.
const pullSchema = z.object({ model: z.string().regex(/^[a-z0-9][a-z0-9._-]*(\/[a-z0-9._-]+)?(:[a-z0-9._-]+)?$/i).max(80) });

// One-click "Download Gemma": Ollama downloads the model itself; this passes its progress through.
export async function POST(req: Request) {
  if (process.env.DEIS_HOSTED === "1") return jsonError("not_here", "Gemma downloads to your own computer, in the Deis app.", 400);
  const input = await body(req, pullSchema);
  if (input instanceof Response) return input;
  let res: Response;
  try {
    res = await pullLocalModel(input.model, req.signal);
  } catch {
    return jsonError("model_unreachable", "Couldn't reach Ollama on this computer. Is it running? Open the Ollama app, then try again.", 502);
  }
  if (!res.ok || !res.body) return jsonError("model_failed", `Ollama couldn't start the download (${res.status}).`, 502);
  return new Response(res.body, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
