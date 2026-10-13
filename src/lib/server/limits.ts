import { kvHit } from "./kv";
import type { AiSettings } from "../ai/settings";

// Guard-rails for the hosted demo's own Gemma key. A user's own key, Ollama or the
// desktop app is never limited: it's their quota. Counts live in Key Value, so a
// restart or a second instance doesn't reset them.

export async function demoLimited(req: Request, settings: AiSettings, perHour: number): Promise<boolean> {
  if (settings.provider !== "demo" || process.env.DEIS_HOSTED !== "1") return false;
  const hour = Math.floor(Date.now() / 3_600_000);
  return (await kvHit(`rl:${clientIp(req)}:${hour}`, 3700)) > perHour;
}

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
