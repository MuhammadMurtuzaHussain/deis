import { describe, expect, it, vi } from "vitest";

// The checkout route opens a Polar checkout for a product. Typed without one, it sends the visitor
// to the buy section on the download page, rather than a JSON error.

vi.mock("@/lib/server/polar", () => ({ polar: { checkouts: { create: vi.fn() }, discounts: { list: vi.fn() } } }));

describe("GET /checkout", () => {
  it("sends a visitor with no product to the buy section", async () => {
    const { GET } = await import("@/app/checkout/route");
    const res = await GET(new Request("https://deiscareers.tech/checkout"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://deiscareers.tech/download#buy");
  });
});
