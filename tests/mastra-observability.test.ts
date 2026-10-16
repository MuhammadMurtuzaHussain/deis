import { describe, expect, it } from "vitest";
import { mastraTracingEnabled, stripSpan } from "../src/mastra/observability";

// Mastra traces carry names, timings, models and token counts. Never a CV, a prompt,
// an output, a key or error text.

describe("mastra trace stripping", () => {
  it("drops input, output, request context and every attribute that could hold text", () => {
    const span = stripSpan({
      input: { messages: [{ role: "user", content: "Aoife Byrne, BSc Data Science…" }] },
      output: { object: { summary: "Data graduate." } },
      requestContext: { chain: { apiKey: "AIza-secret" } },
      metadata: { cv: "anything" },
      attributes: {
        prompt: "Tailor this CV",
        instructions: "You tailor CVs",
        model: "gemma-4-26b-a4b-it",
        provider: "google",
        usage: { inputTokens: 1200, outputTokens: 300 },
        parameters: { temperature: 0.2, maxOutputTokens: 3000, providerOptions: { key: "x" } },
        responseFormat: { schema: {} },
      },
      errorInfo: { message: "No object generated: {\"summary\":\"Aoife…\"}", id: "STRUCTURED_OUTPUT_FAILED", stack: "at …", details: { text: "Aoife" } },
    });
    expect(span.input).toBeUndefined();
    expect(span.output).toBeUndefined();
    expect(span.requestContext).toBeUndefined();
    expect(span.metadata).toEqual({ environment: expect.any(String) });
    expect(span.attributes).toEqual({ model: "gemma-4-26b-a4b-it", provider: "google", usage: { inputTokens: 1200, outputTokens: 300 }, parameters: { temperature: 0.2, maxOutputTokens: 3000 } });
    expect(span.errorInfo).toEqual({ message: "STRUCTURED_OUTPUT_FAILED", id: "STRUCTURED_OUTPUT_FAILED", name: undefined, domain: undefined, category: undefined });
    expect(JSON.stringify(span)).not.toMatch(/Aoife|AIza|Tailor|You tailor/);
  });

  it("is on only with a platform token and project, and in the desktop app only with diagnostics", () => {
    const keys = { MASTRA_PLATFORM_ACCESS_TOKEN: "t", MASTRA_PROJECT_ID: "p" };
    expect(mastraTracingEnabled({})).toBe(false);
    expect(mastraTracingEnabled({ MASTRA_PLATFORM_ACCESS_TOKEN: "t" })).toBe(false);
    expect(mastraTracingEnabled(keys)).toBe(true);
    expect(mastraTracingEnabled({ ...keys, DEIS_DESKTOP: "1" })).toBe(false);
    expect(mastraTracingEnabled({ ...keys, DEIS_DESKTOP: "1", DEIS_DIAGNOSTICS: "1" })).toBe(true);
  });
});
