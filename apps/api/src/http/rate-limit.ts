import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "./context";
import { problem } from "./problem";

/**
 * Workers Rate Limiting bindings (ADR 0002): counted per Cloudflare location and eventually
 * consistent, so a limit is a brake on scripts, not an exact quota. An exact count (claims per
 * key and per device, ADR 0009) lives in D1 with the rule that needs it.
 */
type RateLimitBinding = { [K in keyof Env]: Env[K] extends RateLimit ? K : never }[keyof Env];

/** The key a limit counts by; null when the request carries none. */
export type RateLimitKey = (c: Context<AppEnv>) => string | null;

/**
 * The caller's address, for a limit on a request that has no attested key yet. Held only as the
 * limiter's key: never stored, logged or used to locate anyone (ADR 0002). Carrier NAT puts many
 * phones behind one address, so a limit keyed by it stays generous.
 */
export const byAddress: RateLimitKey = (c) => c.req.header("cf-connecting-ip") ?? null;

/** The attested key the request proved (set by `requireAssertion` or `requireGuest`). */
export const byKey: RateLimitKey = (c) => c.var.keyId ?? null;

export function rateLimit(binding: RateLimitBinding, key: RateLimitKey): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    // No key (a local or test request without the edge's header) shares one bucket: still limited.
    const { success } = await c.env[binding].limit({ key: `${c.req.routePath}:${key(c) ?? "none"}` });
    if (!success) {
      c.header("retry-after", "60");
      return problem(c, 429, "rate_limited", "Too Many Requests");
    }
    await next();
  };
}
