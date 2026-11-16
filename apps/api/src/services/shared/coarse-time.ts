import { DAY_MS, floorTo, HOUR_MS } from "../../lib/time/units";

/**
 * How coarse a time may be anywhere public (carodo-ios ADR 0007). The database keeps exact times
 * for the server's own logic; with a drive's duration shown, a finer start, end or award time in a
 * response would tell when a driver arrived somewhere, so every time others can see goes through
 * here:
 *
 * - `publicHour`: the hour a time is ordered and grouped by where others see it (a drive's
 *   `drove_at`). Exact times are stored for the server's own logic and never leave it.
 * - `agoBucket`: how long ago, as the Feed says it.
 */

/** The hour `at` falls in: the finest a time others see may be. */
export function publicHour(at: number): number {
  return floorTo(at, HOUR_MS);
}

/** How long something stays "now" after it ended. */
const NOW_AFTER_END_MS = HOUR_MS;

/**
 * The relative time of something that happened in the hour `hourAt` begins: "now", then "1h" to
 * "23h", "1d" to "6d", "1w" to "4w", "1mo" to "11mo", then years. "now" is this hour, or anything
 * whose exact `endedAt` (server-side only) is less than an hour ago: a drive that has just ended.
 */
export function agoBucket(hourAt: number, now: number, endedAt?: number): string {
  const elapsed = Math.max(0, now - hourAt);
  if (elapsed < HOUR_MS) return "now";
  if (endedAt !== undefined && now - endedAt < NOW_AFTER_END_MS) return "now";
  const hours = Math.floor(elapsed / HOUR_MS);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(elapsed / DAY_MS);
  if (days < 7) return `${days}d`;
  if (days < 35) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.max(1, Math.floor(days / 30.4375))}mo`;
  return `${Math.floor(days / 365.25)}y`;
}
