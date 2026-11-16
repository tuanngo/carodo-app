import { Hono } from "hono";
import { requireAssertion } from "../http/auth";
import type { AppEnv } from "../http/context";
import { byAddress, rateLimit } from "../http/rate-limit";
import { readBody } from "../http/request";
import { failure } from "../http/respond";
import { clientDataOf } from "../services/attest/assertion";
import { issueChallenge } from "../services/auth/challenges";
import { guestFromAssertion, guestFromAttestation, parseGuestAttestation } from "../services/auth/guest";
import { parseTokenBody, refreshSession, startSession } from "../services/auth/sessions";

/** `/v1/auth/*`: how the app gets its first token (carodo-ios ADR 0009). */
export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/v1/auth/challenge", rateLimit("RL_AUTH", byAddress), async (c) => {
  const result = await issueChallenge(c.env.DB, Date.now());
  if (!result.ok) return failure(c, result);
  c.header("cache-control", "no-store");
  return c.json({ challenge: result.data.challenge });
});

authRoutes.post("/v1/auth/guest", rateLimit("RL_AUTH", byAddress), async (c) => {
  const body = await readBody(c, 32 * 1024);
  if (!body.ok) return failure(c, body);
  const now = Date.now();
  const header = c.req.header("carodo-app-assertion");

  // An empty body with an assertion: a key attested before. Otherwise the first-time attestation.
  let result: Awaited<ReturnType<typeof guestFromAttestation>>;
  if (body.data.bytes.length === 0 && header !== undefined) {
    const url = new URL(c.req.url);
    const clientData = await clientDataOf(c.req.method, url.pathname + url.search, body.data.bytes);
    result = await guestFromAssertion(c.env, header, clientData, now);
  } else {
    const input = parseGuestAttestation(body.data.json());
    result = input.ok ? await guestFromAttestation(c.env, input.data, now) : input;
  }
  if (!result.ok) return failure(c, result);
  c.header("cache-control", "no-store");
  return c.json(result.data);
});

/** A device holding the account secret (iCloud Keychain) opens its own session. */
authRoutes.post("/v1/auth/session", rateLimit("RL_AUTH", byAddress), requireAssertion(4 * 1024), async (c) => {
  const secret = parseTokenBody(c.var.body?.json(), "accountSecret");
  if (!secret.ok) return failure(c, secret);
  const result = await startSession(c.env, secret.data, c.var.keyId as string, Date.now());
  if (!result.ok) return failure(c, result);
  c.header("cache-control", "no-store");
  return c.json(result.data);
});

/** Rotates this device's refresh token; a reused one revokes the session (docs/sync.md "Accounts"). */
authRoutes.post("/v1/auth/refresh", rateLimit("RL_AUTH", byAddress), requireAssertion(4 * 1024), async (c) => {
  const token = parseTokenBody(c.var.body?.json(), "refreshToken");
  if (!token.ok) return failure(c, token);
  const result = await refreshSession(c.env, token.data, c.var.keyId as string, Date.now());
  if (!result.ok) return failure(c, result);
  c.header("cache-control", "no-store");
  return c.json(result.data);
});
