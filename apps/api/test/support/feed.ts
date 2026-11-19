import { env } from "cloudflare:workers";
import { uuidv7 } from "../../src/lib/platform/ids";

const QUARTER = 15 * 60 * 1000;

/** A sharing account written straight to D1: many of them, cheaply. */
export async function seedDriver(
  options: { displayAs?: "anonymous" | "username"; showVehicle?: boolean; sharing?: boolean } = {},
): Promise<{ id: string; username: string }> {
  const id = uuidv7();
  const username = `s_${id.replaceAll("-", "").slice(-16)}`;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO accounts (id, username, secret_hash, feed_opt_in, display_as, show_vehicle, created_at, updated_at)
     VALUES (?, ?, 'x', ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      username,
      options.sharing === false ? 0 : 1,
      options.displayAs ?? "username",
      options.showVehicle === false ? 0 : 1,
      now,
      now,
    )
    .run();
  return { id, username };
}

/**
 * One item (a local day) of `accountId` with a visible drive ending at each of `endedAts` (floored
 * to the quarter hour, as the device sends them), each received on time (others see it from the
 * next quarter), and the item as the quarter-hour job leaves it: last_ended_at is its newest drive's.
 */
export async function seedDay(accountId: string, localDate: string, endedAts: number[]): Promise<string> {
  const itemId = crypto.randomUUID();
  const quarters = endedAts.map((endedAt) => endedAt - (endedAt % QUARTER));
  const last = Math.max(...quarters);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO feed_items (id, account_id, local_date, last_ended_at, created_at) VALUES (?, ?, ?, ?, 0)`,
    ).bind(itemId, accountId, localDate, last),
    ...quarters.map((endedAt) =>
      env.DB.prepare(
        `INSERT INTO drives (trip_id, account_id, item_id, vehicle_make, vehicle_model, distance_m, moving_duration_s,
           elapsed_duration_s, ended_at, visible_at, local_date, local_start_hour, part_of_day, weather, revision,
           published_at, updated_at)
         VALUES (?, ?, ?, 'Kia', 'K3', 1000, 600, 600, ?4, ?4 + ${QUARTER}, ?5, 8, 'morning', 'clear', 1, 0, 0)`,
      ).bind(crypto.randomUUID(), accountId, itemId, endedAt, localDate),
    ),
  ]);
  return itemId;
}
