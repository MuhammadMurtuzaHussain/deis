import { z } from "zod";
import { body } from "@/lib/server/api";
import { activate, buyUrl, licenceState } from "@/lib/server/licence";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ ...(await licenceState()), buyUrl: buyUrl() });
}

export async function POST(req: Request) {
  const input = await body(req, z.object({ key: z.string().min(8).max(200) }));
  if (input instanceof Response) return input;
  const result = await activate(input.key);
  return Response.json({ ...result, licence: await licenceState() }, { status: result.ok ? 200 : 400 });
}
