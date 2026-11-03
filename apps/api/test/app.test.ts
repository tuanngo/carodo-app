import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("http", () => {
  it("answers an unknown path with a problem document", async () => {
    const response = await exports.default.fetch("https://api.carodo.test/v1/nowhere");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toEqual({ type: "about:blank", title: "Not Found", status: 404, code: "not_found" });
  });
});
