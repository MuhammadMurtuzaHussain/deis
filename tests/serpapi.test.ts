import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hideKey, parseSerpKey, SERPAPI_HEADER } from "@/lib/serpapi";

// A user's own SerpApi key: used instead of the shared one, free of the shared budget but
// under a daily cap of its own, and never written into an error, a log line or a response.

const USER = "a".repeat(32) + "b".repeat(32);
const SHARED = "c".repeat(64);
const search = { id: "t", query: "graduate", location: "Ireland", pages: 1 };
const results = { jobs_results: [{ title: "Graduate Analyst", company_name: "Acme", location: "Dublin, Ireland", apply_options: [{ title: "Acme", link: "https://acme.ie/1" }] }] };

beforeEach(() => {
  vi.resetModules();
  for (const k of ["DEIS_OFFLINE", "DEIS_HOSTED", "DEIS_STATE_DIR", "DEIS_FEED_URL", "REDIS_URL", "SERPAPI_OWN_DAILY_CAP"]) vi.stubEnv(k, "");
  vi.stubEnv("SERPAPI_KEY", SHARED);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** fetch that says the shared account is out of searches, and answers searches with one job. */
function serp(onSearch: (url: string) => unknown = () => results) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url.includes("account.json")) return Response.json({ total_searches_left: url.includes(USER) ? 180 : 3 });
      return Response.json(onSearch(url));
    }),
  );
  return urls;
}

describe("the key header", () => {
  it("accepts a key, trimmed, and nothing that isn't key-shaped", () => {
    expect(parseSerpKey(`  ${USER}\n`)).toBe(USER);
    expect(parseSerpKey(null)).toBeNull();
    expect(parseSerpKey("")).toBeNull();
    expect(parseSerpKey("short")).toBeNull();
    expect(parseSerpKey(`${USER}&engine=google`)).toBeNull();
    expect(parseSerpKey("x".repeat(200))).toBeNull();
  });

  it("hides every copy of the key and any api_key= in a message", () => {
    expect(hideKey(`bad ${USER} and ${USER}`, USER)).toBe("bad [key] and [key]");
    expect(hideKey("https://serpapi.com/search.json?q=x&api_key=zzz123&hl=en", null)).toBe("https://serpapi.com/search.json?q=x&api_key=[key]&hl=en");
  });
});

describe("a user's own key", () => {
  it("is used instead of SERPAPI_KEY", async () => {
    const urls = serp();
    const { runSearch } = await import("@/lib/server/feed");
    const r = await runSearch(search, { userKey: USER });
    expect(r.from).toBe("serpapi");
    const searches = urls.filter((u) => u.includes("search.json"));
    expect(searches).toHaveLength(1);
    expect(searches[0]).toContain(`api_key=${USER}`);
    expect(urls.some((u) => u.includes(SHARED))).toBe(false);
  });

  it("skips the shared budget and floor, which stop the shared key", async () => {
    const urls = serp();
    const { runSearch } = await import("@/lib/server/feed");
    expect((await runSearch(search)).from).toBe("budget");
    expect(urls.some((u) => u.includes("search.json"))).toBe(false);
    expect((await runSearch({ ...search, id: "u", query: "junior" }, { userKey: USER })).from).toBe("serpapi");
  });

  it("writes its results into the shared cache", async () => {
    serp();
    const { runSearch } = await import("@/lib/server/feed");
    await runSearch(search, { userKey: USER });
    const again = await runSearch(search);
    expect(again.from).toBe("cache");
    expect(again.jobs).toHaveLength(1);
  });

  it("has a daily cap of its own", async () => {
    vi.stubEnv("SERPAPI_OWN_DAILY_CAP", "1");
    serp();
    const { runSearch } = await import("@/lib/server/feed");
    expect((await runSearch({ ...search, query: "a" }, { userKey: USER })).from).toBe("serpapi");
    expect((await runSearch({ ...search, query: "b" }, { userKey: USER })).from).toBe("budget");
  });

  it("never appears in a log line or a thrown message when SerpApi echoes it back", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    serp(() => ({ error: `Invalid API key. Your key ${USER} is not valid.` }));
    const { runSearch } = await import("@/lib/server/feed");
    const r = await runSearch(search, { userKey: USER });
    expect(r.from).toBe("error");
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(USER);
    expect(JSON.stringify(warn.mock.calls)).toContain("[key]");
  });

  it("comes in the x-deis-serpapi header of a feed request", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const urls = serp();
    const { POST } = await import("@/app/api/feed/route");
    const res = await POST(new Request("http://127.0.0.1/api/feed", { method: "POST", headers: { "content-type": "application/json", [SERPAPI_HEADER]: USER }, body: JSON.stringify({ categories: ["software"] }) }));
    const body = await res.text();
    expect(body).not.toContain(USER);
    const searches = urls.filter((u) => u.includes("search.json"));
    expect(searches.length).toBeGreaterThan(0);
    expect(searches.every((u) => u.includes(`api_key=${USER}`))).toBe(true);
    // The key goes to serpapi.com and nowhere else.
    expect(urls.filter((u) => u.includes(USER)).every((u) => u.startsWith("https://serpapi.com/"))).toBe(true);
  });
});

describe("the desktop app with a key", () => {
  it("runs the Google Jobs searches itself and never sends the key to the hosted feed", async () => {
    vi.stubEnv("DEIS_FEED_URL", "https://deis-bu83.onrender.com");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { fromGreenhouse } = await import("@/lib/jobs/normalise");
    const board = fromGreenhouse({ id: 9, title: "Graduate Engineer", location: { name: "Dublin, Ireland" }, absolute_url: "https://boards.greenhouse.io/acme/jobs/9", content: "<p>Graduates in Dublin.</p>" }, "Acme");
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.startsWith("https://deis-bu83.onrender.com")) return Response.json({ jobs: [board], sources: { boards: 1, searches: { software: "budget" } }, stale: false });
        if (url.includes("account.json")) return Response.json({ total_searches_left: 180 });
        return Response.json(results);
      }),
    );
    const { POST } = await import("@/app/api/feed/route");
    const res = await POST(new Request("http://127.0.0.1/api/feed", { method: "POST", headers: { "content-type": "application/json", [SERPAPI_HEADER]: USER }, body: JSON.stringify({ categories: ["software"] }) }));
    const out = await res.json();
    expect(out.jobs.map((j: { title: string }) => j.title).sort()).toEqual(["Graduate Analyst", "Graduate Engineer"]);
    expect(out.sources.searches.software).toBe("serpapi");
    const hosted = calls.filter((c) => c.url.startsWith("https://deis-bu83.onrender.com"));
    expect(hosted).toHaveLength(1);
    expect(JSON.stringify(hosted[0])).not.toContain(USER);
    expect(calls.some((c) => c.url.includes("search.json") && c.url.includes(USER))).toBe(true);
  });
});

describe("the key check route", () => {
  const check = async (key: string) => {
    const { GET } = await import("@/app/api/serpapi/route");
    return GET(new Request("http://127.0.0.1/api/serpapi", { headers: { "content-type": "application/json", [SERPAPI_HEADER]: key } }));
  };

  it("says how many searches the key has left", async () => {
    serp();
    const res = await check(USER);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, left: 180 });
  });

  it("says clearly when SerpApi refuses the key, without repeating it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: `Invalid API key: ${USER}` }, { status: 401 })));
    const res = await check(USER);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("serpapi_key");
    expect(body.message).toMatch(/didn't accept this key/);
    expect(JSON.stringify(body)).not.toContain(USER);
  });

  it("refuses something that isn't a key without calling SerpApi", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect((await check("nope")).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("Sentry", () => {
  it("drops the key header and scrubs a key-shaped string from an event", async () => {
    const { scrubEvent } = await import("@/lib/privacy");
    const e = scrubEvent({ message: `search failed for ${USER}`, request: { headers: { [SERPAPI_HEADER]: USER, accept: "*/*" } } });
    expect(JSON.stringify(e)).not.toContain(USER);
    expect(e.request?.headers).toEqual({ accept: "*/*" });
  });
});
