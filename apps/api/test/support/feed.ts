import { env } from "cloudflare:workers";
import { uuidv7 } from "../../src/lib/platform/ids";

const HOUR = 60 * 60 * 1000;

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
 * One item (a local day) of `accountId` with a visible drive ending at each of `endedAts`, as
 * publishing leaves it: the item's sort hour is its newest drive's end hour.
 */
export async function seedDay(accountId: string, localDate: string, endedAts: number[]): Promise<string> {
  const itemId = crypto.randomUUID();
  const last = Math.max(...endedAts);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO feed_items (id, account_id, local_date, sort_hour, last_ended_at, created_at)
       VALUES (?, ?, ?, ?, ?, 0)`,
    ).bind(itemId, accountId, localDate, last - (last % HOUR), last),
    ...endedAts.map((endedAt) =>
      env.DB.prepare(
        `INSERT INTO drives (trip_id, account_id, item_id, vehicle_make, vehicle_model, distance_m, moving_duration_s,
           elapsed_duration_s, started_at, ended_at, drove_at, local_date, local_start_hour, part_of_day, weather,
           revision, published_at, updated_at)
         VALUES (?, ?, ?, 'Kia', 'K3', 1000, 600, 600, ?4 - 600000, ?4, ?4 - 600000 - ((?4 - 600000) % ${HOUR}), ?5, 8,
           'morning', 'clear', 1, 0, 0)`,
      ).bind(crypto.randomUUID(), accountId, itemId, endedAt, localDate),
    ),
  ]);
  return itemId;
}
