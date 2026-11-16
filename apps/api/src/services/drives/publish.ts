import { writeEvent } from "../../lib/observability/analytics";
import { isUuid } from "../../lib/platform/ids";
import type { AccountCaller } from "../auth/sessions";
import { refreshAfterPublish, refreshItemOfTrip } from "../feed/items";
import { integerIn } from "../shared/input";
import { fail, ok, type Result } from "../shared/result";
import type { DriveFields } from "./input";

/**
 * Publishing and unpublishing a car drive (contract `PUT`/`DELETE /v1/feed/drives/{tripId}`).
 * Arrival order means nothing (ADR 0007): a write is applied only with a higher revision than the
 * one stored, in one statement, so a late, older write and a retry both change nothing and still
 * succeed. Two exceptions, both from the contract: a drive Stop sharing took off comes back with a
 * republish at its unchanged revision; an unpublish keeps a tombstone with its revision for 30 days
 * (pruned by `prune.expired`), so only a higher revision publishes it again.
 *
 * A drive joins its author's item for its local day (`feed_items`), created on the first drive of
 * that day; the item's place in the Feed is refreshed in the same transaction.
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

  const db = env.DB;
  // The day's item, made by the first drive of that day; its id is random (never derived).
  const item = db
    .prepare(
      `INSERT INTO feed_items (id, account_id, local_date, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (account_id, local_date) DO NOTHING`,
    )
    .bind(crypto.randomUUID(), caller.accountId, drive.localDate, now);

  // Sharing is checked again in the statement, so a drive racing Stop sharing is not published
  // after it. The day's other drives are counted here too, so two publishes at once cannot both
  // take the last place; the count reads at most ?18 rows of `drives_on_account_id`.
  const upsert = db
    .prepare(
      `INSERT INTO drives (trip_id, account_id, item_id, vehicle_make, vehicle_model, distance_m,
         moving_duration_s, elapsed_duration_s, started_at, ended_at, drove_at, local_date,
         local_start_hour, part_of_day, weather, shape, revision, published_at, updated_at)
       SELECT ?1, ?2, (SELECT id FROM feed_items WHERE account_id = ?2 AND local_date = ?11), ?3, ?4, ?5,
         ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?17
       WHERE (SELECT feed_opt_in FROM accounts WHERE id = ?2 AND deleted_at IS NULL) = 1
         AND (SELECT count(*) FROM (
           SELECT 1 FROM drives d WHERE d.account_id = ?2 AND d.local_date = ?11 AND d.trip_id <> ?1
             AND d.hidden_at IS NULL AND d.unpublished_at IS NULL AND d.stopped_at IS NULL LIMIT ?18)) < ?18
       ON CONFLICT (trip_id) DO UPDATE SET
         item_id = excluded.item_id, vehicle_make = excluded.vehicle_make,
         vehicle_model = excluded.vehicle_model, distance_m = excluded.distance_m,
         moving_duration_s = excluded.moving_duration_s, elapsed_duration_s = excluded.elapsed_duration_s,
         started_at = excluded.started_at, ended_at = excluded.ended_at, drove_at = excluded.drove_at,
         local_date = excluded.local_date, local_start_hour = excluded.local_start_hour,
         part_of_day = excluded.part_of_day, weather = excluded.weather, shape = excluded.shape,
         revision = excluded.revision, updated_at = excluded.updated_at,
         published_at = CASE WHEN drives.unpublished_at IS NULL THEN drives.published_at ELSE excluded.published_at END,
         unpublished_at = NULL, stopped_at = NULL
       WHERE drives.account_id = excluded.account_id
         AND (excluded.revision > drives.revision
           OR (excluded.revision = drives.revision AND drives.stopped_at IS NOT NULL AND drives.unpublished_at IS NULL))`,
    )
    .bind(
      tripId,
      caller.accountId,
      drive.vehicle.make,
      drive.vehicle.model,
      drive.distanceM,
      drive.movingDurationS,
      drive.elapsedDurationS,
      drive.startedAt,
      drive.endedAt,
      drive.droveAt,
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
 * Takes a drive off the Feed. Without a row yet (the unpublish overtook its publish), it leaves a
 * tombstone, so the late publish with its lower revision is refused.
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

  // A tombstone carries no drive: zeros, no item (NULL) and an empty day, never shown.
  const [unpublished] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO drives (trip_id, account_id, item_id, distance_m, moving_duration_s, elapsed_duration_s,
         started_at, ended_at, drove_at, local_date, revision, published_at, updated_at, unpublished_at)
       VALUES (?1, ?2, NULL, 0, 0, 0, 0, 0, 0, '', ?3, ?4, ?4, ?4)
       ON CONFLICT (trip_id) DO UPDATE SET
         revision = excluded.revision, updated_at = excluded.updated_at,
         unpublished_at = coalesce(drives.unpublished_at, excluded.unpublished_at)
       WHERE excluded.revision >= drives.revision AND drives.account_id = excluded.account_id`,
    ).bind(tripId, caller.accountId, revision.data, now),
    refreshItemOfTrip(env.DB, tripId),
  ]);
  // Idempotent, and silent about another account's trip: the answer is the same either way.
  if (unpublished?.meta.changes === 1) writeEvent(env.EVENTS, "drive.unpublished");
  return ok(null);
}
