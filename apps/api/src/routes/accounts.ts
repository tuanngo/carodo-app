import { Hono } from "hono";
import { requireAccount, requireAssertion, requireGuest, requireReader } from "../http/auth";
import type { AppEnv } from "../http/context";
import { byAddress, byKey, rateLimit } from "../http/rate-limit";
import { failure } from "../http/respond";
import { claimAccount, parseClaim } from "../services/accounts/claim";
import { deleteAccount } from "../services/accounts/lifecycle";
import { parseProfileInput, readProfile, renameAccount } from "../services/accounts/profile";
import { parseSharing, readSharing, updateSharing } from "../services/accounts/sharing";
import { checkUsername, suggestUsernames } from "../services/accounts/usernames";

/** `/v1/accounts`, `/v1/account`, `/v1/me/*`, `/v1/usernames/*`: the account itself (carodo-ios ADR 0008). */
export const accountRoutes = new Hono<AppEnv>();

/**
 * Claim a username. The guest token and the assertion must name the same attested key; the claim
 * limit counts per key.
 */
accountRoutes.post(
  "/v1/accounts",
  rateLimit("RL_AUTH", byAddress),
  // The guest token is one HMAC; the assertion a D1 read and an ECDSA verify: cheapest first (C6).
  requireGuest,
  requireAssertion(16 * 1024),
  rateLimit("RL_CLAIM", byKey),
  async (c) => {
    const input = parseClaim(c.var.body?.json());
    if (!input.ok) return failure(c, input);
    const result = await claimAccount(c.env, input.data, c.var.keyId as string, Date.now());
    if (!result.ok) return failure(c, result);
    c.header("cache-control", "no-store");
    return c.json(result.data, 201);
  },
);

/** Delete the account; no undo (specs/account.md). */
accountRoutes.delete(
  "/v1/account",
  rateLimit("RL_AUTH", byAddress),
  requireAssertion(1024),
  requireAccount,
  async (c) => {
    const result = await deleteAccount(c.env, c.var.account as NonNullable<typeof c.var.account>, Date.now());
    if (!result.ok) return failure(c, result);
    return c.body(null, 204);
  },
);

/** Whether a username can be claimed, as the person types; guests and members alike. */
accountRoutes.get("/v1/usernames/:username", requireReader, rateLimit("RL_READ", byKey), async (c) => {
  const now = Date.now();
  const { username, refusal } = await checkUsername(c.env, c.req.param("username"), now);
  const suggestions = refusal === "taken" && username !== null ? await suggestUsernames(c.env, username, now) : [];
  c.header("cache-control", "no-store");
  return c.json({ available: refusal === null, reason: refusal, suggestions });
});

accountRoutes.get("/v1/me/profile", requireAccount, rateLimit("RL_READ", byKey), async (c) => {
  const result = await readProfile(c.env, c.var.account as NonNullable<typeof c.var.account>);
  if (!result.ok) return failure(c, result);
  c.header("cache-control", "private, no-cache");
  return c.json(result.data);
});

accountRoutes.put("/v1/me/profile", requireAccount, requireAssertion(1024), rateLimit("RL_WRITE", byKey), async (c) => {
  const input = parseProfileInput(c.var.body?.json());
  if (!input.ok) return failure(c, input);
  const result = await renameAccount(c.env, c.var.account as NonNullable<typeof c.var.account>, input.data, Date.now());
  if (!result.ok) return failure(c, result);
  return c.json(result.data);
});

accountRoutes.get("/v1/me/sharing", requireAccount, rateLimit("RL_READ", byKey), async (c) => {
  const result = await readSharing(c.env, c.var.account as NonNullable<typeof c.var.account>);
  if (!result.ok) return failure(c, result);
  c.header("cache-control", "private, no-cache");
  return c.json(result.data);
});

accountRoutes.put("/v1/me/sharing", requireAccount, requireAssertion(1024), rateLimit("RL_WRITE", byKey), async (c) => {
  const input = parseSharing(c.var.body?.json(), "body");
  if (!input.ok) return failure(c, input);
  const result = await updateSharing(c.env, c.var.account as NonNullable<typeof c.var.account>, input.data, Date.now());
  if (!result.ok) return failure(c, result);
  return c.json(result.data);
});
