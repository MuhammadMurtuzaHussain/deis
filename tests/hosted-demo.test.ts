import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The web demo runs two fictional profiles only. A visitor's own CV or LinkedIn text is
// read in the desktop app, never sent to the hosted model, so the server refuses it.

const cvText = "Jane Doe. Software developer. Experience: built a booking API for a clinic in Galway, 2024 to 2025.";

beforeEach(() => {
  vi.resetModules();
  for (const k of ["DEIS_OFFLINE", "DEIS_STATE_DIR", "GOOGLE_GENERATIVE_AI_API_KEY", "FALLBACK_BASE_URL", "FALLBACK_MODEL"]) vi.stubEnv(k, "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const post = (body: unknown) =>
  new Request("http://localhost/api/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("hosted web demo: own CV is refused", () => {
  it("answers 403 with demo_only on the hosted demo, before any model is reached", async () => {
    vi.stubEnv("DEIS_HOSTED", "1");
    const { POST } = await import("@/app/api/import/route");
    const res = await POST(post({ source: "cv", text: cvText }));
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string; message: string };
    expect(json.error).toBe("demo_only");
    expect(json.message).toMatch(/Deis app/);
  });
});
