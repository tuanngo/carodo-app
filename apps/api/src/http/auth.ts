import type { MiddlewareHandler } from "hono";
import { LABEL_GUEST_TOKEN } from "../lib/crypto/secret-key";
import { assertWithKey } from "../services/attest/app-keys";
import { clientDataOf, parseAssertionHeader } from "../services/attest/assertion";
import { attestPolicy } from "../services/attest/policy";
import { authenticateAccess } from "../services/auth/sessions";
import { verifyToken } from "../services/auth/tokens";
import type { AppEnv } from "./context";
import { readBody } from "./request";
import { failure } from "./respond";

/**
 * How a route learns who is calling (carodo-ios ADR 0009). Each middleware authenticates and sets
 * `c.var`; the rules about what the caller may do stay in the services.
 */

/** The bearer token, or undefined. */
function bearer(header: string | undefined): string | undefined {
  const match = /^Bearer ([A-Za-z0-9_.-]{1,512})$/.exec(header ?? "");
  return match?.[1];
}

/** A guest token (`/v1/auth/guest`): sets `keyId` to the attested key it was issued to. */
export const requireGuest: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = bearer(c.req.header("authorization"));
  if (!token) return failure(c, { ok: false, code: "unauthorized", detail: "A guest token is required." });
  const claims = await verifyToken(c.env.SECRET_KEY, LABEL_GUEST_TOKEN, token, Date.now());
  if (!claims.ok) return failure(c, claims);
  if (c.var.keyId !== undefined && c.var.keyId !== claims.data.subject) {
    return failure(c, { ok: false, code: "unauthorized", detail: "The token belongs to another key." });
  }
  c.set("keyId", claims.data.subject);
  await next();
};

/**
 * A reader of public things (the Feed, its community numbers, username checks): a guest token, or an account's
 * access token (contract `security: [guestToken, bearerAuth]`). A guest token is one HMAC and is
 * tried first; an access token also sets `account`, so a member's page carries their own part.
 */
export const requireReader: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = bearer(c.req.header("authorization"));
  if (!token) return failure(c, { ok: false, code: "unauthorized", detail: "A guest or access token is required." });
  const now = Date.now();
  const guest = await verifyToken(c.env.SECRET_KEY, LABEL_GUEST_TOKEN, token, now);
  if (guest.ok) {
    c.set("keyId", guest.data.subject);
    return next();
  }
  const caller = await authenticateAccess(c.env, token, now);
  if (!caller.ok) return failure(c, { ok: false, code: "unauthorized", detail: "The token is not valid." });
  c.set("account", caller.data);
  c.set("keyId", caller.data.keyId);
  await next();
};

/**
 * A `Carodo-App-Assertion` over this request: reads the body once (kept in `c.var.body`), checks
 * the assertion by a stored key with a rising counter, and sets `keyId`.
 */
export function requireAssertion(maxBodyBytes: number): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header("carodo-app-assertion");
    if (header === undefined) {
      return failure(c, { ok: false, code: "unauthorized", detail: "An app assertion is required." });
    }
    const body = await readBody(c, maxBodyBytes);
    if (!body.ok) return failure(c, body);
    const parsed = parseAssertionHeader(header);
    if (!parsed.ok) return failure(c, parsed);

    const url = new URL(c.req.url);
    const clientData = await clientDataOf(c.req.method, url.pathname + url.search, body.data.bytes);
    const asserted = await assertWithKey(
      c.env.DB,
      attestPolicy(c.env),
      parsed.data.keyId,
      parsed.data.assertion,
      clientData,
      Date.now(),
    );
    if (!asserted.ok) return failure(c, asserted);
    // After `requireGuest`, the token and the assertion must name the same key.
    if (c.var.keyId !== undefined && c.var.keyId !== asserted.data.keyId) {
      return failure(c, { ok: false, code: "unauthorized", detail: "The token belongs to another key." });
    }
    c.set("keyId", asserted.data.keyId);
    c.set("body", body.data);
    await next();
  };
}

/**
 * An account access token whose session is still live (sign-out and deletion stop it at once).
 * After `requireAssertion`, the assertion's key must be the key the session is bound to.
 */
export const requireAccount: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = bearer(c.req.header("authorization"));
  if (!token) return failure(c, { ok: false, code: "unauthorized", detail: "An access token is required." });
  const caller = await authenticateAccess(c.env, token, Date.now());
  if (!caller.ok) return failure(c, caller);
  if (c.var.keyId !== undefined && c.var.keyId !== caller.data.keyId) {
    return failure(c, { ok: false, code: "unauthorized", detail: "The token belongs to another key." });
  }
  c.set("account", caller.data);
  c.set("keyId", caller.data.keyId);
  await next();
};
