import { Hono } from "hono";
import { requireAccount, requireAssertion, requireReader } from "../http/auth";
import type { AppEnv } from "../http/context";
import { byKey, rateLimit } from "../http/rate-limit";
import { failure, jsonWithETag } from "../http/respond";
import { readThrough } from "../lib/cache/edge-cache";
import { parseItemId, parseReaction, react, unreact } from "../services/feed/reactions";
import { parseCursor, readerPage, type SharedPage, sharedPage } from "../services/feed/read";
import { communityStats } from "../services/feed/stats";
import { feedClock } from "../services/shared/coarse-time";

/** `/v1/feed`, `/v1/feed/stats`, reactions (carodo-ios ADR 0007; ADR 0008 for the cache). */
export const feedRoutes = new Hono<AppEnv>();

/**
 * How long a Feed page is shared. A page is served for at most two buckets (its own, then as the
 * stale copy), so a deleted account or a hidden drive leaves every page within two minutes.
 */
const FIRST_PAGE_TTL_MS = 30_000;
const LATER_PAGE_TTL_MS = 60_000;
const STATS_TTL_MS = 5 * 60_000;

/** A guest's answer is the same for every guest (contract: up to about 2 minutes old). */
const GUEST_CACHE = "public, max-age=60";

/** The Workers Cache does nothing locally and on workers.dev; the race guard still works. */
function store(env: Env) {
  return env.ENVIRONMENT === "production" ? caches.default : null;
}

feedRoutes.get("/v1/feed", requireReader, rateLimit("RL_READ", byKey), async (c) => {
  const now = Date.now();
  const cursor = c.req.query("cursor");
  const position = await parseCursor(c.env.SECRET_KEY, cursor);
  if (!position.ok) return failure(c, position);

  // The key names the page and its quarter, never the reader: every reader shares it (ADR 0008),
  // and a new quarter (drives released, ages moved on) is a new page.
  const clock = feedClock(now);
  const key = new URL("/__cache/v1/feed", c.req.url);
  key.searchParams.set("q", String(clock.quarter));
  key.searchParams.set("cursor", cursor ?? "");
  const shared = await readThrough({
    store: store(c.env),
    key: key.toString(),
    ttlMs: cursor ? LATER_PAGE_TTL_MS : FIRST_PAGE_TTL_MS,
    now,
    waitUntil: (promise) => c.executionCtx.waitUntil(promise),
    compute: async () => JSON.stringify(await sharedPage(c.env, position.data, clock)),
  });
  const reader = c.var.account?.accountId ?? null;
  // A member's own drives others cannot see yet are laid on here, never into the shared page.
  const page = await readerPage(c.env, JSON.parse(shared.body) as SharedPage, reader, clock, now, !cursor);
  c.header("x-cache", shared.source);
  // A shared cache may keep a guest's page (public), never hand it to a member, whose page is their own.
  c.header("vary", "authorization");
  return jsonWithETag(c, JSON.stringify(page), reader === null ? GUEST_CACHE : "private, no-cache");
});

feedRoutes.get("/v1/feed/stats", requireReader, rateLimit("RL_READ", byKey), async (c) => {
  const now = Date.now();
  const clock = feedClock(now);
  const key = new URL("/__cache/v1/feed/stats", c.req.url);
  key.searchParams.set("q", String(clock.quarter));
  const shared = await readThrough({
    store: store(c.env),
    key: key.toString(),
    ttlMs: STATS_TTL_MS,
    now,
    waitUntil: (promise) => c.executionCtx.waitUntil(promise),
    compute: async () => JSON.stringify(await communityStats(c.env, clock)),
  });
  c.header("x-cache", shared.source);
  return jsonWithETag(c, shared.body, GUEST_CACHE);
});

// Members only (requireAccount refuses a guest token), with an assertion and the per-key write limit.
feedRoutes.use("/v1/feed/items/:itemId/reaction", requireAccount, requireAssertion(1024), rateLimit("RL_WRITE", byKey));

feedRoutes.put("/v1/feed/items/:itemId/reaction", async (c) => {
  const itemId = parseItemId(c.req.param("itemId"));
  if (!itemId.ok) return failure(c, itemId);
  const reaction = parseReaction(c.var.body?.json());
  if (!reaction.ok) return failure(c, reaction);
  const reader = c.var.account as NonNullable<typeof c.var.account>;
  const result = await react(c.env, reader.accountId, itemId.data, reaction.data, Date.now());
  if (!result.ok) return failure(c, result);
  return c.body(null, 204);
});

feedRoutes.delete("/v1/feed/items/:itemId/reaction", async (c) => {
  const itemId = parseItemId(c.req.param("itemId"));
  if (!itemId.ok) return failure(c, itemId);
  const reader = c.var.account as NonNullable<typeof c.var.account>;
  const result = await unreact(c.env, reader.accountId, itemId.data);
  if (!result.ok) return failure(c, result);
  return c.body(null, 204);
});
