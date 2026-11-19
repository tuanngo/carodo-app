import { VISIBLE } from "./items";

/**
 * Others see a drive from its `visible_at` (services/shared/coarse-time.ts). At each quarter the
 * `feed.release` job lists the items whose drives became visible since its last run, so an item
 * appears or moves up only at a quarter hour, never when a drive is published (P9).
 */

/** Items refreshed per run: a backlog is finished by the next quarters (cost C10). */
export const RELEASE_BATCH = 1000;

/**
 * Lists the drives with `visible_at` in (`from`, `to`] on their items: each item whose newest drive
 * others may now see is newer than the one it shows. Idempotent: an item already showing it is not
 * selected again. `done` is false when the batch was full and drives may be left for the next run.
 * Reads the drives through `drives_on_visible_at`, each item through its primary key.
 */
export async function releaseFeed(
  db: D1Database,
  from: number,
  to: number,
): Promise<{ items: number; done: boolean; rowsRead: number }> {
  const { meta } = await db
    .prepare(
      `UPDATE feed_items SET last_ended_at = (
         SELECT max(d.ended_at) FROM drives d WHERE d.item_id = feed_items.id AND ${VISIBLE} AND d.visible_at <= ?2)
       WHERE id IN (
         SELECT DISTINCT d.item_id FROM drives d JOIN feed_items i ON i.id = d.item_id
         WHERE d.visible_at > ?1 AND d.visible_at <= ?2 AND ${VISIBLE}
           AND (i.last_ended_at IS NULL OR i.last_ended_at < d.ended_at)
         LIMIT ${RELEASE_BATCH})`,
    )
    .bind(from, to)
    .run();
  return { items: meta.changes, done: meta.changes < RELEASE_BATCH, rowsRead: meta.rows_read };
}
