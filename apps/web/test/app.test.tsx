import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("web", () => {
  it("answers an unknown link with a page, not a stack trace", async () => {
    const response = await exports.default.fetch("https://carodo.test/t/unknown");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("This link is not available");
    expect(html).not.toContain("<script");
  });

  it("reaches the api through the service binding", async () => {
    expect(await env.API.ping()).toEqual({ environment: "test-api" });
  });
});
