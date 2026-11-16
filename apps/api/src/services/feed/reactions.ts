import { writeEvent } from "../../lib/observability/analytics";
import { isUuid } from "../../lib/platform/ids";
import { publicHour } from "../shared/coarse-time";
import { isRecord } from "../shared/input";
import { fail, ok, type Result } from "../shared/result";
import { WINDOW_MS } from "./items";

/**
 * Reactions (contract `/v1/feed/items/{itemId}/reaction`, carodo-ios ADR 0007): five fixed ones,
 * one per reader per item, members only; a new one replaces the reader's previous one. Who reacted
 * is never returned, only the counts.
 */

export const REACTIONS = ["fire", "coffee", "clap", "road", "party"] as const;

export function parseItemId(value: string): Result<string> {
  const id = value.toLowerCase();
  return isUuid(id) ? ok(id) : fail("validation", "itemId must be a UUID.");
}

export function parseReaction(body: unknown): Result<string> {
  if (!isRecord(body) || !REACTIONS.includes(body.reaction as (typeof REACTIONS)[number])) {
    return fail("validation", `reaction must be one of ${REACTIONS.join(", ")}.`);
  }
  return ok(body.reaction as string);
}

/** Stores the reader's reaction on an item still on the Feed (a visible drive, within 72 hours). */
export async function react(
  env: Env,
  readerId: string,
  itemId: string,
  reaction: string,
  now: number,
): Promise<Result<null>> {
  const { meta } = await env.DB.prepare(
    `INSERT INTO reactions (item_id, account_id, reaction, created_at)
     SELECT ?1, ?2, ?3, ?4
     WHERE EXISTS (SELECT 1 FROM feed_items WHERE id = ?1 AND sort_hour IS NOT NULL AND sort_hour >= ?5)
     ON CONFLICT (item_id, account_id) DO UPDATE SET reaction = excluded.reaction`,
  )
    .bind(itemId, readerId, reaction, now, publicHour(now - WINDOW_MS))
    .run();
  if (meta.changes === 0) return fail("not_found", "The item is gone.");
  writeEvent(env.EVENTS, "reaction.set", reaction);
  return ok(null);
}

/** Removes the reader's reaction; idempotent. */
export async function unreact(env: Env, readerId: string, itemId: string): Promise<Result<null>> {
  await env.DB.prepare("DELETE FROM reactions WHERE item_id = ? AND account_id = ?").bind(itemId, readerId).run();
  return ok(null);
}
