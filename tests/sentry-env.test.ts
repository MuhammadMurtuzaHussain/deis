import { describe, expect, it } from "vitest";
import { guardTitle } from "../src/lib/server/telemetry";
import { browserEnvironment, serverEnvironment } from "../src/lib/sentry-env";

// Sentry environments keep laptop testing out of the demo's numbers, and guard issue
// titles name the task so one rule across tasks doesn't look like duplicates.

describe("sentry environment", () => {
  it("names the server's environment", () => {
    expect(serverEnvironment({ RENDER: "true" })).toBe("demo");
    expect(serverEnvironment({ DEIS_DESKTOP: "1" })).toBe("desktop");
    expect(serverEnvironment({ DEIS_DESKTOP: "1", RENDER: "true" })).toBe("desktop");
    expect(serverEnvironment({})).toBe("development");
    expect(serverEnvironment({ SENTRY_ENVIRONMENT: "staging", RENDER: "true" })).toBe("staging");
  });

  it("treats this machine and the local network as development in the browser", () => {
    for (const h of ["localhost", "127.0.0.1", "[::1]", "192.168.1.20", "172.20.10.3", "10.0.0.5", "mac.local"]) expect(browserEnvironment(h)).toBe("development");
    for (const h of ["deiscareers.tech", "deis-bu83.onrender.com", "172.217.0.1"]) expect(browserEnvironment(h)).toBe("demo");
  });
});

describe("guard issue titles", () => {
  it("name the task and the rule", () => {
    expect(guardTitle("cv", "uncited")).toBe("Guard (cv): A CV line cited no fact");
    expect(guardTitle("fit", "json_failed")).toBe("Guard (fit): Gemma never returned valid JSON");
    expect(guardTitle("card", "new_rule")).toBe("Guard (card): new_rule");
  });
});
