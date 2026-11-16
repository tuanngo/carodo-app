import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { fromBase64Url } from "../../../src/lib/encoding/bytes";
import { CHALLENGE_TTL_MS, consumeChallenge, issueChallenge } from "../../../src/services/auth/challenges";

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);

describe("challenges", () => {
  it("issues 32 random bytes that live for 5 minutes", async () => {
    const result = await issueChallenge(env.DB, NOW);
    if (!result.ok) throw new Error(result.code);
    expect(fromBase64Url(result.data.challenge)).toHaveLength(32);
    expect(result.data.expiresAt).toBe(NOW + CHALLENGE_TTL_MS);

    const other = await issueChallenge(env.DB, NOW);
    expect(other.ok && other.data.challenge).not.toBe(result.data.challenge);
  });

  it("is spent by its first use", async () => {
    const issued = await issueChallenge(env.DB, NOW);
    if (!issued.ok) throw new Error(issued.code);

    expect(await consumeChallenge(env.DB, issued.data.challenge, NOW + 1000)).toEqual({ ok: true, data: null });
    expect(await consumeChallenge(env.DB, issued.data.challenge, NOW + 2000)).toMatchObject({
      ok: false,
      code: "unauthorized",
    });
  });

  it("refuses one that expired, and spends it anyway", async () => {
    const issued = await issueChallenge(env.DB, NOW);
    if (!issued.ok) throw new Error(issued.code);

    const late = NOW + CHALLENGE_TTL_MS;
    expect(await consumeChallenge(env.DB, issued.data.challenge, late)).toMatchObject({ ok: false });
    const row = await env.DB.prepare("SELECT 1 FROM auth_challenges WHERE id = ?").bind(issued.data.challenge).first();
    expect(row).toBeNull();
  });

  it("refuses one it never issued", async () => {
    expect(await consumeChallenge(env.DB, "never-issued", NOW)).toMatchObject({ ok: false, code: "unauthorized" });
  });
});

describe("POST /v1/auth/challenge", () => {
  it("answers a challenge that is not cached", async () => {
    const response = await exports.default.fetch("https://api.carodo.test/v1/auth/challenge", { method: "POST" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json<{ challenge: string }>();
    expect(Object.keys(body)).toEqual(["challenge"]);
    expect(fromBase64Url(body.challenge)).toHaveLength(32);
  });

  it("is limited per address", async () => {
    const request = () =>
      exports.default.fetch("https://api.carodo.test/v1/auth/challenge", {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.7" },
      });
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await request()).status);
    expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(true);

    const limited = await request();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("content-type")).toBe("application/problem+json");
    expect(await limited.json()).toMatchObject({ status: 429, code: "rate_limited" });
  });

  it("answers GET as not found", async () => {
    const response = await exports.default.fetch("https://api.carodo.test/v1/auth/challenge");
    expect(response.status).toBe(404);
  });
});
