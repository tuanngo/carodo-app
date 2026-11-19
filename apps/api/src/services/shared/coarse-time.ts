import { DAY_MS, floorTo, HOUR_MS, QUARTER_MS } from "../../lib/time/units";

/**
 * How coarse a time of a drive may be (P9, carodo-ios ADR 0007). The device sends a drive's end
 * already on a quarter hour and the server keeps nothing finer; the quarter is the finest time
 * anyone else may see or observe, so every boundary a reader can notice (a drive appearing, leaving
 * the window, its age changing, a cached page) falls on a quarter of server time. The server's own
 * audit columns are exact server time and never leave it (owner, 2026-11-19).
 */

/** How long a drive stays on the Feed. */
export const FEED_WINDOW_MS = 168 * HOUR_MS;

/** True when `at` is a quarter hour (:00, :15, :30, :45 UTC, no seconds). */
export function isQuarter(at: number): boolean {
  return at % QUARTER_MS === 0;
}

/**
 * When others may first see a drive, fixed once when the server receives it: the quarter after the
 * one it ended in, or after the quarter it arrived in when it came later (Auto Mode noticing an end
 * late, an outbox flushed after a day offline). Never the moment of arrival: that moment minus a
 * known delay would tell the end to the minute.
 */
export function visibleAt(endedAt: number, receivedAt: number): number {
  return Math.max(endedAt, floorTo(receivedAt, QUARTER_MS)) + QUARTER_MS;
}

/**
 * The Feed at `now`, on quarters: others see a drive once its `visible_at` is at most `quarter`
 * (services/feed/release.ts makes it so at that quarter), while its `ended_at` is at least
 * `windowStart`.
 */
export interface FeedClock {
  quarter: number;
  windowStart: number;
}

export function feedClock(now: number): FeedClock {
  const quarter = floorTo(now, QUARTER_MS);
  return { quarter, windowStart: quarter - FEED_WINDOW_MS };
}

/**
 * How long ago a drive was released (`endedAt` + a quarter), as the Feed says it: "now" before
 * that and for an hour after, then "1h" to "23h", then "1d" to "6d" (contract `Ago`).
 */
export function agoLabel(endedAt: number, now: number): string {
  const elapsed = now - (endedAt + QUARTER_MS);
  if (elapsed < HOUR_MS) return "now";
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h`;
  return `${Math.min(6, Math.floor(elapsed / DAY_MS))}d`;
}
