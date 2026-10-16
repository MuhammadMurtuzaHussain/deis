import { z } from "zod";
import { body, jsonError } from "@/lib/server/api";
import { offlineMode, setOfflineMode } from "@/lib/server/net";

export const runtime = "nodejs";

// The "Work offline" switch, for Settings and the desktop menu. With it on, this server
// connects to nothing but this computer. Forced on by DEIS_OFFLINE=1 or --offline; never
// on the hosted demo.
export async function GET() {
  return Response.json({ mode: offlineMode() });
}

export async function POST(req: Request) {
  if (process.env.DEIS_HOSTED === "1") return jsonError("not_here", "Offline mode is for the Deis app and for running Deis on your own computer.", 403);
  if (offlineMode() === "forced") return jsonError("forced", "Deis was started in offline mode. Restart it normally to go online.", 403);
  const input = await body(req, z.object({ on: z.boolean() }));
  if (input instanceof Response) return input;
  setOfflineMode(input.on);
  return Response.json({ mode: offlineMode() });
}
