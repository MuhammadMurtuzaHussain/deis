import type { BrowserOptions } from "@sentry/nextjs";

// What Sentry gets from Deis: timings, model names, token counts and which guard
// rule fired. Never a CV, a fact, a posting, a prompt, an output or a key. AI inputs
// and outputs are switched off in every Sentry.init (dataCollection.genAI), and this
// strips query strings and request bodies from anything else that slips through.

const URL_QUERY = /(https?:\/\/[^\s?#"]+)\?[^\s#"]*/g;
/** API keys in URLs or headers: AI Studio keys, SerpApi keys, bearer tokens. */
const SECRET = /\b(AIza[\w-]{20,}|sk-[\w-]{16,}|Bearer\s+[\w.-]{16,}|[a-f0-9]{64})\b/g;

export function scrubText(s: string): string {
  return s.replace(URL_QUERY, "$1").replace(SECRET, "[key]");
}

function scrubRecord(r: Record<string, unknown> | undefined) {
  if (!r) return;
  for (const k of Object.keys(r)) {
    if (/^(http\.query|url\.query|http\.request\.body|gen_ai\.(prompt|completion|request\.messages|response\.text))/.test(k)) delete r[k];
    else if (typeof r[k] === "string") r[k] = scrubText(r[k] as string);
  }
}

export function scrubSpan<T extends { name: string; data?: Record<string, unknown>; attributes?: Record<string, unknown> }>(span: T): T {
  span.name = scrubText(span.name);
  scrubRecord(span.data);
  scrubRecord(span.attributes);
  return span;
}

export function scrubBreadcrumb<T extends { message?: string; data?: Record<string, unknown> }>(b: T): T {
  if (b.message) b.message = scrubText(b.message);
  scrubRecord(b.data);
  return b;
}

export function scrubEvent<T extends { message?: string; exception?: { values?: { value?: string }[] }; request?: { url?: string; query_string?: unknown; data?: unknown; headers?: Record<string, string> } }>(e: T): T {
  if (e.message) e.message = scrubText(e.message);
  for (const x of e.exception?.values ?? []) if (x.value) x.value = scrubText(x.value);
  if (e.request) {
    if (e.request.url) e.request.url = scrubText(e.request.url);
    delete e.request.query_string;
    delete e.request.data;
    if (e.request.headers) delete e.request.headers["x-deis-ai"];
  }
  return e;
}

export const privacy = { beforeSendSpan: scrubSpan, beforeBreadcrumb: scrubBreadcrumb, beforeSend: scrubEvent };

export const dataCollection: NonNullable<BrowserOptions["dataCollection"]> = {
  userInfo: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  httpBodies: [],
  httpHeaders: { deny: ["forwarded", "-ip", "remote-", "via", "-user", "x-deis-ai", "authorization", "cookie"] },
  cookies: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
  urlQueryParams: { deny: ["forwarded", "-ip", "remote-", "via", "-user", "key", "api_key", "token"] },
};
