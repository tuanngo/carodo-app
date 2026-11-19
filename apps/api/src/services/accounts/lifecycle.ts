import { writeEvent } from "../../lib/observability/analytics";
import { logEvent } from "../../lib/observability/log";
import { uuidv7 } from "../../lib/platform/ids";
import type { AccountCaller } from "../auth/sessions";
import { fail, ok, type Result } from "../shared/result";
import { USERNAME_HOLD_MS, usernameHoldHash } from "./usernames";

/** Account deletion (specs/account.md, docs/sync.md "Accounts"). */

/**
 * Deletes the account. At once, in one transaction: unusable (secret and every session), its
 * drives and items deleted (P9: nothing of a drive outlives the account on the Feed), its reactions gone, and the username held 90 days as a hash
 * linked to nothing. Erasing every row and object follows (`account.erase`, within 30 days);
 * readers already skip a deleted account.
 */
export async function deleteAccount(env: Env, caller: AccountCaller, now: number): Promise<Result<null>> {
  const account = await env.DB.prepare("SELECT username FROM accounts WHERE id = ? AND deleted_at IS NULL")
    .bind(caller.accountId)
    .first<{ username: string }>();
  if (!account) return fail("unauthorized", "The account no longer exists.");

  const id = caller.accountId;
  const statements = [
    // The real name leaves the row now; the avatar key stays for the erase job to delete the object.
    env.DB.prepare(
      `UPDATE accounts SET deleted_at = ?, updated_at = ?, username = 'deleted:' || id, display_name = NULL,
         secret_hash = '', feed_opt_in = 0
       WHERE id = ? AND deleted_at IS NULL`,
    ).bind(now, now, id),
    env.DB.prepare(
      `INSERT INTO username_holds (name_hash, released_at) VALUES (?, ?)
       ON CONFLICT (name_hash) DO UPDATE SET released_at = excluded.released_at`,
    ).bind(await usernameHoldHash(env.SECRET_KEY, account.username), now + USERNAME_HOLD_MS),
    env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL").bind(now, id),
    env.DB.prepare("DELETE FROM drives WHERE account_id = ?").bind(id),
    env.DB.prepare("DELETE FROM feed_items WHERE account_id = ?").bind(id),
    env.DB.prepare("DELETE FROM reactions WHERE account_id = ?").bind(id),
    // Work owed: R2 objects under the account's prefixes, then every row (services/accounts/erase.ts).
    env.DB.prepare(
      `INSERT INTO pending_ops (id, kind, target, attempts, next_attempt_at, created_at)
       VALUES (?, 'account.erase', ?, 0, ?, ?) ON CONFLICT (kind, target) DO NOTHING`,
    ).bind(uuidv7(now), id, now, now),
  ];
  const [deleted] = await env.DB.batch(statements);
  // A concurrent deletion won: the first statement changed nothing, and the rest were no-ops too.
  if (deleted?.meta.changes !== 1) return fail("unauthorized", "The account no longer exists.");

  logEvent("info", "account.deleted");
  writeEvent(env.EVENTS, "account.deleted");
  return ok(null);
}
