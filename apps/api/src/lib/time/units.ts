/** Durations in milliseconds (instants are Unix ms, P3), so a constant reads as what it is. */

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** The start of the unit `at` falls in (UTC; an hour and a minute are the same in every zone). */
export function floorTo(at: number, unitMs: number): number {
  return Math.floor(at / unitMs) * unitMs;
}

/** A quarter hour: the finest time of a drive that leaves the device (P9). */
export const QUARTER_MS = 15 * MINUTE_MS;
