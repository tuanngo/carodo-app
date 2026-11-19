import { writeEvent } from "../../lib/observability/analytics";
import { isUuid } from "../../lib/platform/ids";
import type { AccountCaller } from "../auth/sessions";
import { refreshAfterPublish, refreshItemOfTrip, VISIBLE } from "../feed/items";
import { feedClock } from "../shared/coarse-time";
import { integerIn } from "../shared/input";
import { fail, ok, type Result } from "../shared/result";
import type { DriveFields } from "./input";

/**
 * Publishing and unpublishing a car drive (contract `PUT`/`DELETE /v1/feed/drives/{tripId}`).
 * Arrival order means nothing (ADR 0007): a write is applied only with a higher revision than the
 * one stored, in one statement, so a late, older write and a retry both change nothing and still
 * succeed. An unpublish keeps a tombstone (its trip and revision, no summary) while the drive is in
 * the Feed's window (pruned by `prune.expired`), so only a higher revision publishes it again. A
 * drive already older than the window is answered as done and not stored (ADR 0007).
 *
 * A drive joins its author's item for its local day (`feed_items`), created on the first drive of
 * that day while sharing is on; the item's place in the Feed is refreshed in the same transaction.
 */

/**
 * The most visible drives one account may have on one local day. A Feed item is one person's day
 * and a page reads its items' drives whole, so a day must stay small; 50 is more than any real day
 * of car driving.
 */
export const MAX_DRIVES_PER_DAY = 50;

/** A trip id from the path, lowercased: the device's UUIDs print in capitals. */
export function parseTripId(value: string): Result<string> {
  const id = value.toLowerCase();
  return isUuid(id) ? ok(id) : fail("validation", "tripId must be a UUID.");
}

export async function publishDrive(
  env: Env,
  caller: AccountCaller,
  tripId: string,
  drive: DriveFields,
  now: number,
): Promise<Result<null>> {
  if (!caller.sharing) return fail("forbidden", "Sharing is off.", "sharing_off");
  // Out of the Feed already: nothing to keep, and nothing for a later write to undo.
  if (drive.endedAt < feedClock(now).windowStart) return ok(null);

  const db = env.DB;
  // The day's item, made by the first drive of that day; its id is random (never derived). Only
  // while sharing is on, so a refused publish leaves no row.
  const item = db
    .prepare(
      `INSERT INTO feed_items (id, account_id, local_date, created_at)
       SELECT ?1, ?2, ?3, ?4 WHERE (SELECT feed_opt_in FROM accounts WHERE id = ?2 AND deleted_at IS NULL) = 1
       ON CONFLICT (account_id, local_date) DO NOTHING`,
    )
    .bind(crypto.randomUUID(), caller.accountId, drive.localDate, now);

  // Sharing is checked again in the statement, so a drive racing Stop sharing is not published
  // after it. The day's other drives are counted here too, so two publishes at once cannot both
  // take the last place; the count reads at most ?18 rows of `drives_on_account_id`.
  const upsert = db
    .prepare(
      `INSERT INTO drives (trip_id, account_id, item_id, vehicle_make, vehicle_model, distance_m,
         moving_duration_s, elapsed_duration_s, ended_at, local_date, local_start_hour, part_of_day, weather,
         shape, revision, published_at, updated_at)
       SELECT ?1, ?2, (SELECT id FROM feed_items WHERE account_id = ?2 AND local_date = ?9), ?3, ?4, ?5,
         ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15
       WHERE (SELECT feed_opt_in FROM accounts WHERE id = ?2 AND deleted_at IS NULL) = 1
         AND (SELECT count(*) FROM (
           SELECT 1 FROM drives d WHERE d.account_id = ?2 AND d.local_date = ?9 AND d.trip_id <> ?1
             AND ${VISIBLE} LIMIT ?16)) < ?16
       ON CONFLICT (trip_id) DO UPDATE SET
         item_id = excluded.item_id, vehicle_make = excluded.vehicle_make,
         vehicle_model = excluded.vehicle_model, distance_m = excluded.distance_m,
         moving_duration_s = excluded.moving_duration_s, elapsed_duration_s = excluded.elapsed_duration_s,
         ended_at = excluded.ended_at, local_date = excluded.local_date,
         local_start_hour = excluded.local_start_hour, part_of_day = excluded.part_of_day,
         weather = excluded.weather, shape = excluded.shape, revision = excluded.revision,
         updated_at = excluded.updated_at,
         published_at = CASE WHEN drives.unpublished_at IS NULL THEN drives.published_at ELSE excluded.published_at END,
         unpublished_at = NULL
       WHERE drives.account_id = excluded.account_id AND excluded.revision > drives.revision`,
    )
    .bind(
      tripId,
      caller.accountId,
      drive.vehicle.make,
      drive.vehicle.model,
      drive.distanceM,
      drive.movingDurationS,
      drive.elapsedDurationS,
      drive.endedAt,
      drive.localDate,
      drive.localStartHour,
      drive.partOfDay,
      drive.weather,
      drive.shape === null ? null : JSON.stringify(drive.shape),
      drive.revision,
      now,
      MAX_DRIVES_PER_DAY,
    );

  const [, upserted] = await db.batch([item, upsert, refreshAfterPublish(db, caller.accountId, drive.localDate, now)]);

  if (upserted?.meta.changes === 0) {
    // Not applied: another account's trip, an older or repeated revision (success, nothing to do),
    // sharing turned off in between, or else the day was full.
    const stored = await db
      .prepare("SELECT account_id, revision FROM drives WHERE trip_id = ?")
      .bind(tripId)
      .first<{ account_id: string; revision: number }>();
    if (stored && stored.account_id !== caller.accountId) return fail("not_found", "No such drive.");
    if (stored && stored.revision >= drive.revision) return ok(null);
    const sharing = await db
      .prepare("SELECT feed_opt_in FROM accounts WHERE id = ?")
      .bind(caller.accountId)
      .first<{ feed_opt_in: number }>();
    if (sharing?.feed_opt_in !== 1) return fail("forbidden", "Sharing is off.", "sharing_off");
    return fail("unprocessable", `A day holds at most ${MAX_DRIVES_PER_DAY} published drives.`, "out_of_range");
  }
  writeEvent(env.EVENTS, "drive.published", "", drive.distanceM);
  return ok(null);
}

/**
 * Takes a drive off the Feed: its summary is cleared and only a tombstone is left (trip, revision,
 * its quarter-hour end and local day, for pruning and its item's refresh). Without a row yet (the
 * unpublish overtook its publish), it leaves one ending at this quarter, so the late publish with
 * its lower revision is refused.
 */
export async function unpublishDrive(
  env: Env,
  caller: AccountCaller,
  tripId: string,
  revisionParam: string | undefined,
  now: number,
): Promise<Result<null>> {
  const revision = integerIn(
    revisionParam === undefined || revisionParam === "" ? undefined : Number(revisionParam),
    "revision",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (!revision.ok) return revision;

  // A tombstone carries no drive: zeros, no item, no car, shape or weather, never shown.
  const [unpublished] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO drives (trip_id, account_id, item_id, distance_m, moving_duration_s, elapsed_duration_s,
         ended_at, local_date, revision, published_at, updated_at, unpublished_at)
       VALUES (?1, ?2, NULL, 0, 0, 0, ?5, '', ?3, ?4, ?4, ?4)
       ON CONFLICT (trip_id) DO UPDATE SET
         item_id = NULL, vehicle_make = NULL, vehicle_model = NULL, distance_m = 0, moving_duration_s = 0,
         elapsed_duration_s = 0, local_start_hour = NULL, part_of_day = NULL, weather = NULL, shape = NULL,
         revision = excluded.revision, updated_at = excluded.updated_at,
         unpublished_at = coalesce(drives.unpublished_at, excluded.unpublished_at)
       WHERE excluded.revision >= drives.revision AND drives.account_id = excluded.account_id`,
    ).bind(tripId, caller.accountId, revision.data, now, feedClock(now).quarter),
    refreshItemOfTrip(env.DB, caller.accountId, tripId),
  ]);
  // Idempotent, and silent about another account's trip: the answer is the same either way.
  if (unpublished?.meta.changes === 1) writeEvent(env.EVENTS, "drive.unpublished");
  return ok(null);
}
