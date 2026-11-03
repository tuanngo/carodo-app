import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("WebRpc", () => {
  it("answers through a binding, as the web Worker calls it", async () => {
    expect(await exports.WebRpc.ping()).toEqual({ environment: "local" });
  });
});
