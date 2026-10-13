export const runtime = "nodejs";

// On the user's own machine: is Ollama running, and which Gemma models does it have?
// The hosted demo never probes local addresses.
export async function GET() {
  if (process.env.DEIS_HOSTED === "1") return Response.json({ running: false, models: [], hosted: true });
  try {
    const r = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(2000) });
    const d = (await r.json()) as { models?: { name: string; size: number }[] };
    return Response.json({ running: true, models: (d.models ?? []).map((m) => ({ name: m.name, gb: Math.round((m.size / 1e9) * 10) / 10 })) });
  } catch {
    return Response.json({ running: false, models: [] });
  }
}
