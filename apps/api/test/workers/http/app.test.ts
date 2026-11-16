import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("http", () => {
  it("answers an unknown path with a problem document", async () => {
    const response = await exports.default.fetch("https://api.carodo.test/v1/nowhere");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toEqual({ type: "about:blank", title: "Not Found", status: 404, code: "not_found" });
  });
});

describe("request metrics", () => {
  // The Worker and the test share the binding, so its writes can be read here.
  let points: AnalyticsEngineDataPoint[] = [];
  const write = env.METRICS.writeDataPoint.bind(env.METRICS);
  beforeEach(() => {
    points = [];
    (env.METRICS as { writeDataPoint: typeof write }).writeDataPoint = (point) => {
      if (point) points.push(point);
      write(point);
    };
  });
  afterEach(() => {
    (env.METRICS as { writeDataPoint: typeof write }).writeDataPoint = write;
  });

  it("records the route pattern and the outcome, never the URL", async () => {
    await exports.default.fetch("https://api.carodo.test/v1/auth/challenge?secret=never-recorded", {
      method: "POST",
    });
    await exports.default.fetch("https://api.carodo.test/v1/auth/guest", { method: "POST", body: "{}" });
    await exports.default.fetch("https://api.carodo.test/v1/nowhere/at-all");

    expect(points.map((point) => point.blobs?.slice(0, 3))).toEqual([
      ["/v1/auth/challenge", "POST", "ok"],
      ["/v1/auth/guest", "POST", "validation"],
      ["(unmatched)", "GET", "not_found"],
    ]);
    expect(points.map((point) => point.doubles?.[0])).toEqual([200, 400, 404]);
    expect(JSON.stringify(points)).not.toContain("never-recorded");
    expect(JSON.stringify(points)).not.toContain("at-all");
  });
});
