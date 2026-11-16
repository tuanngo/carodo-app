import { writeEvent } from "../../lib/observability/analytics";
import { logEvent } from "../../lib/observability/log";
import { accountPrefixes } from "../../lib/storage/keys";

/**
 * The second half of an account deletion (specs/account.md): every object and row about a deleted
 * account is erased; its username stays held, linked to nothing (`username_holds`). Owed work lives
 * in `pending_ops` (`account.erase`) and is retried with backoff until it succeeds.
 *
 * Objects go first, rows after, so no object is left without the row that names it. A run lists at
 * most one page per prefix (R2 answers up to 1000 keys a page) and deletes what it found; an account
 * with more objects keeps its rows and its owed op, and the next run goes on (docs/cost.md C10).
 *
 * "Within 30 days" covers what is not ours to erase at once: D1 Time Travel keeps 30 days of
 * history, so an erased row is unrecoverable after that.
 */

const PER_RUN = 25;
const MAX_ATTEMPTS = 10;
/** R2 deletes at most 1000 keys a call. */
const DELETE_BATCH = 1000;

interface Owed {
  id: string;
  target: string;
  attempts: number;
}

export interface EraseCounts {
  erased: number;
  objects: number;
  pending: number;
  failed: number;
}

export async function eraseDeletedAccounts(env: Env, now: number): Promise<EraseCounts> {
  const { results: owed } = await env.DB.prepare(
    `SELECT id, target, attempts FROM pending_ops
     WHERE next_attempt_at <= ? AND kind = 'account.erase'
     ORDER BY next_attempt_at LIMIT ?`,
  )
    .bind(now, PER_RUN)
    .all<Owed>();
  if (owed.length === 0) return { erased: 0, objects: 0, pending: 0, failed: 0 };

  try {
    // Every listing together: one round of calls, never one per account.
    const listings = await Promise.all(
      owed.flatMap((item) => accountPrefixes(item.target).map((prefix) => env.BLOBS.list({ prefix }))),
    );
    const keys = listings.flatMap((listing) => listing.objects.map((object) => object.key));
    const chunks = Array.from({ length: Math.ceil(keys.length / DELETE_BATCH) }, (_, i) =>
      keys.slice(i * DELETE_BATCH, (i + 1) * DELETE_BATCH),
    );
    await Promise.all(chunks.map((chunk) => env.BLOBS.delete(chunk)));

    // An account whose listing had more pages keeps its rows until a run finds nothing left.
    const perAccount = accountPrefixes("").length;
    const finished = owed.filter((_, i) =>
      listings.slice(i * perAccount, (i + 1) * perAccount).every((listing) => !listing.truncated),
    );

    // ON DELETE CASCADE removes the account's sessions, drives, Feed items (with every reaction
    // on them), its own reactions and its username changes. Only an account already marked deleted
    // is erased.
    if (finished.length > 0) {
      await env.DB.batch(
        finished.flatMap((item) => [
          env.DB.prepare("DELETE FROM accounts WHERE id = ? AND deleted_at IS NOT NULL").bind(item.target),
          env.DB.prepare("DELETE FROM pending_ops WHERE id = ?").bind(item.id),
        ]),
      );
      writeEvent(env.EVENTS, "account.erased", "", finished.length);
    }
    return { erased: finished.length, objects: keys.length, pending: owed.length - finished.length, failed: 0 };
  } catch (error) {
    // Nothing was erased from D1 (objects may be, and deleting one twice is harmless): postpone
    // every item at once, each by its own backoff (1 min, 2, 4 … capped at a day), in one statement.
    await env.DB.prepare(
      `UPDATE pending_ops SET attempts = attempts + 1,
         next_attempt_at = ?1 + min(60000 * (1 << min(attempts, 20)), 86400000)
       WHERE id IN (SELECT value FROM json_each(?2))`,
    )
      .bind(now, JSON.stringify(owed.map((item) => item.id)))
      .run();
    const exhausted = owed.some((item) => item.attempts + 1 >= MAX_ATTEMPTS);
    logEvent(exhausted ? "error" : "warn", "account.erase_failed", {
      accounts: owed.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return { erased: 0, objects: 0, pending: 0, failed: owed.length };
  }
}
