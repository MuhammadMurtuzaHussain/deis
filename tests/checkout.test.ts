import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The checkout route opens a Polar checkout for a product and, in October, applies the offer code
// by name through Polar's public checkout endpoint. Typed without a product, it sends the visitor
// to the buy section on the download page, rather than a JSON error.

const create = vi.fn();
vi.mock("@/lib/server/polar", () => ({ polar: { checkouts: { create: (...a: unknown[]) => create(...a) } } }));

const realFetch = globalThis.fetch;
let calls: { url: string; init?: RequestInit }[] = [];
const respond = (status: number) =>
  vi.fn((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(new Response(status === 200 ? "{}" : '{"detail":"no"}', { status }));
  });

beforeEach(() => {
  vi.resetModules();
  calls = [];
  create.mockReset();
  create.mockResolvedValue({ url: "https://polar.sh/checkout/polar_c_test", client_secret: "polar_c_test" });
  vi.stubEnv("POLAR_SERVER", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  globalThis.fetch = realFetch;
});

const get = async (path: string) => {
  const { GET } = await import("@/app/checkout/route");
  return GET(new Request(`https://deiscareers.tech${path}`));
};

describe("GET /checkout", () => {
  it("sends a visitor with no product to the buy section", async () => {
    const res = await get("/checkout");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/download#buy");
    expect(create).not.toHaveBeenCalled();
  });

  it("applies the October code by name, then opens the checkout", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-18T12:00:00Z"), toFake: ["Date"] });
    globalThis.fetch = respond(200) as typeof fetch;
    const res = await get("/checkout?products=p1");
    expect(create).toHaveBeenCalledWith({ products: ["p1"] });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.polar.sh/v1/checkouts/client/polar_c_test");
    expect(calls[0].init?.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ discount_code: "hacktoberfest" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://polar.sh/checkout/polar_c_test");
  });

  it("still opens the checkout at full price when Polar refuses the code", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-18T12:00:00Z"), toFake: ["Date"] });
    globalThis.fetch = respond(422) as typeof fetch;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await get("/checkout?products=p1");
    expect(calls).toHaveLength(1);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://polar.sh/checkout/polar_c_test");
  });

  it("applies no code once the offer has ended", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-01T00:00:01Z"), toFake: ["Date"] });
    globalThis.fetch = respond(200) as typeof fetch;
    const res = await get("/checkout?products=p1");
    expect(calls).toHaveLength(0);
    expect(res.status).toBe(302);
  });
});
