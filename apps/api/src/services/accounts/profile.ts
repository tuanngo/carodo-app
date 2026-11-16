import { writeEvent } from "../../lib/observability/analytics";
import { uuidv7 } from "../../lib/platform/ids";
import { DAY_MS } from "../../lib/time/units";
import type { AccountCaller } from "../auth/sessions";
import { isRecord } from "../shared/input";
import { fail, ok, type Result } from "../shared/result";
import { isUsernameConflict, type Profile } from "./claim";
import { checkUsername, REFUSAL_CODES, USERNAME_HOLD_MS, usernameHoldHash } from "./usernames";

/**
 * The account's own profile (contract `/v1/me/profile`): its username. A change is refused after 3
 * changes in 30 days (`username_change_limit`); the old name is held 90 days like a deleted
 * account's, so nobody takes it at once to pass as its owner. Items show the name when they are
 * read, so every item follows a change.
 */

export const RENAMES_PER_WINDOW = 3;
export const RENAME_WINDOW_MS = 30 * DAY_MS;

export async function readProfile(env: Env, caller: AccountCaller): Promise<Result<Profile>> {
  const row = await env.DB.prepare("SELECT username FROM accounts WHERE id = ? AND deleted_at IS NULL")
    .bind(caller.accountId)
    .first<{ username: string }>();
  if (!row) return fail("unauthorized", "The account no longer exists.");
  return ok({ id: caller.accountId, username: row.username });
}

/** Contract `ProfileInput`. */
export function parseProfileInput(body: unknown): Result<{ username: unknown }> {
  if (!isRecord(body)) return fail("validation", "The body must be a JSON object.");
  return ok({ username: body.username });
}

export async function renameAccount(
  env: Env,
  caller: AccountCaller,
  input: { username: unknown },
  now: number,
): Promise<Result<Profile>> {
  const current = await readProfile(env, caller);
  if (!current.ok) return current;
  const checked = await checkUsername(env, input.username, now);
  // The same name again changes nothing and counts as no change.
  if (checked.username !== null && checked.username === current.data.username) return current;
  if (checked.refusal !== null || checked.username === null) {
    const refusal = REFUSAL_CODES[checked.refusal ?? "invalid"];
    return fail(refusal.code, `This username cannot be used (${checked.refusal}).`, refusal.reason);
  }
  const username = checked.username;
  const since = now - RENAME_WINDOW_MS;

  // One transaction. The rename itself checks the limit and the new name's hold, so two renames at
  // once cannot pass the limit together; the old name's hold and the change's record follow it only
  // when it changed a row (`changes() = 1`, the statement just before).
  const statements = [
    env.DB.prepare(
      `UPDATE accounts SET username = ?1, updated_at = ?2
       WHERE id = ?3 AND deleted_at IS NULL AND username = ?4
         AND (SELECT count(*) FROM (
           SELECT 1 FROM username_changes WHERE account_id = ?3 AND changed_at > ?5 LIMIT ?6)) < ?6
         AND NOT EXISTS (SELECT 1 FROM username_holds WHERE name_hash = ?7 AND released_at > ?2)`,
    ).bind(
      username,
      now,
      caller.accountId,
      current.data.username,
      since,
      RENAMES_PER_WINDOW,
      await usernameHoldHash(env.SECRET_KEY, username),
    ),
    env.DB.prepare(
      `INSERT INTO username_holds (name_hash, released_at) SELECT ?, ? WHERE changes() = 1
       ON CONFLICT (name_hash) DO UPDATE SET released_at = excluded.released_at`,
    ).bind(await usernameHoldHash(env.SECRET_KEY, current.data.username), now + USERNAME_HOLD_MS),
    env.DB.prepare("INSERT INTO username_changes (id, account_id, changed_at) SELECT ?, ?, ? WHERE changes() = 1").bind(
      uuidv7(now),
      caller.accountId,
      now,
    ),
  ];
  try {
    const [renamed] = await env.DB.batch(statements);
    if (renamed?.meta.changes === 1) {
      writeEvent(env.EVENTS, "account.renamed");
      return ok({ id: caller.accountId, username });
    }
  } catch (error) {
    if (isUsernameConflict(error)) return fail("conflict", "This username is taken.", "username_taken");
    throw error;
  }
  // Nothing changed: the limit was reached, or the new name became held in between.
  const recent = await env.DB.prepare(
    "SELECT count(*) AS n FROM (SELECT 1 FROM username_changes WHERE account_id = ? AND changed_at > ? LIMIT ?)",
  )
    .bind(caller.accountId, since, RENAMES_PER_WINDOW)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= RENAMES_PER_WINDOW) {
    return fail("too_many", "At most 3 username changes in 30 days.", "username_change_limit");
  }
  return fail("conflict", "This username is taken.", "username_taken");
}
