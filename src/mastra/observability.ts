import type { AnySpan, ObservabilityExporter, SpanOutputProcessor } from "@mastra/core/observability";
import { MastraPlatformExporter, Observability } from "@mastra/observability";
import { isOfflineMode } from "@/lib/server/net";
import { serverEnvironment } from "@/lib/sentry-env";

// Mastra traces on Mastra Platform: one trace per workflow run or agent call, with
// the agent, the model that answered, timings and token counts. Off unless
// MASTRA_PLATFORM_ACCESS_TOKEN and MASTRA_PROJECT_ID are set, in the desktop app off
// unless DEIS_DIAGNOSTICS=1, and nothing at all while offline mode is on.
//
// Never sent: CVs, facts, postings, prompts, outputs, keys, error text. Every span
// loses its input, output and request context, and keeps only the attributes below.

const KEEP = new Set(["model", "provider", "responseModel", "usage", "usageIncomplete", "finishReason", "streaming", "stepIndex", "resultType", "maxSteps", "availableTools", "completionStartTime"]);

type Strippable = {
  input?: unknown;
  output?: unknown;
  requestContext?: unknown;
  metadata?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  errorInfo?: { message: string; id?: string; name?: string; stack?: string; domain?: string; category?: string; details?: unknown };
};

/** What's left of a span after stripping: names, timings, models, token counts. Mutates and returns the same span. */
export function stripSpan<T extends Strippable>(span: T): T {
  span.input = undefined;
  span.output = undefined;
  span.requestContext = undefined;
  span.metadata = { environment: serverEnvironment(process.env) };
  if (span.attributes) {
    const kept: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(span.attributes)) if (KEEP.has(k)) kept[k] = v;
    const p = span.attributes.parameters as { temperature?: number; maxOutputTokens?: number } | undefined;
    if (p) kept.parameters = { temperature: p.temperature, maxOutputTokens: p.maxOutputTokens };
    span.attributes = kept;
  }
  // An error's message, stack and details can carry raw model output, which holds a CV.
  if (span.errorInfo) {
    const { id, name, domain, category } = span.errorInfo;
    span.errorInfo = { message: id ?? name ?? "error", id, name, domain, category };
  }
  return span;
}

const strip: SpanOutputProcessor = {
  name: "deis-strip",
  process: (span?: AnySpan) => (!span || isOfflineMode() ? undefined : stripSpan(span as unknown as Strippable) && span),
  shutdown: async () => {},
};

export const mastraTracingEnabled = (env: Record<string, string | undefined> = process.env) =>
  Boolean(env.MASTRA_PLATFORM_ACCESS_TOKEN && env.MASTRA_PROJECT_ID) && (env.DEIS_DESKTOP !== "1" || env.DEIS_DIAGNOSTICS === "1");

/** Kit scores (src/mastra/scorers.ts) go wherever traces go, under the same switches. */
export const kitScoringEnabled = (env: Record<string, string | undefined> = process.env) => mastraTracingEnabled(env) && !isOfflineMode();

/** Tests pass their own exporter; everyone else sends to Mastra Platform. */
export function observability(exporters?: ObservabilityExporter[]): Observability | undefined {
  if (!mastraTracingEnabled() || isOfflineMode()) return undefined;
  return new Observability({
    configs: {
      default: {
        serviceName: "deis",
        exporters: exporters ?? [new MastraPlatformExporter()],
        spanOutputProcessors: [strip],
      },
    },
  });
}
