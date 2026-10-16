import { describe, expect, it } from "vitest";
import { offerOn } from "@/lib/offer";

describe("October offer", () => {
  it("runs to the end of 31 October, Irish time", () => {
    expect(offerOn(Date.parse("2026-10-16T12:00:00Z"))).toBe(true);
    expect(offerOn(Date.parse("2026-10-31T23:59:59Z"))).toBe(true);
    expect(offerOn(Date.parse("2026-11-01T00:00:00Z"))).toBe(false);
  });
});
