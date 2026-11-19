import type { FeedClock } from "../shared/coarse-time";
import { VISIBLE } from "./items";

/**
 * The community's numbers over the Feed's 7 days (contract `CommunityStats`, carodo-ios ADR 0007):
 * only from at least 10 distinct drivers; below that every number is null (never 0) and `warmup`
 * says how close the Feed is, in steps of 0.1. The same for every reader, so it is computed once
 * per cache bucket (ADR 0008); a computation reads the window's drives through `drives_on_ended_at`,
 * only those others can see (released, P9).
 */

export const MINIMUM_DRIVERS = 10;

export interface CommunityStats {
  windowHours: 168;
  visible: boolean;
  drivers: number | null;
  distanceM: number | null;
  durationS: number | null;
  /** The local hour most drives started in (7 = 7–8 AM). */
  busiestHour: number | null;
  warmup: number | null;
}

/** ?1 the window's start, ?2 the last released quarter. */
const WINDOW = `d.ended_at BETWEEN ?1 AND ?2 AND ${VISIBLE}`;

export const TOTALS_SQL = `SELECT count(DISTINCT d.account_id) AS drivers, coalesce(sum(d.distance_m), 0) AS distance_m,
         coalesce(sum(d.elapsed_duration_s), 0) AS duration_s
       FROM drives d WHERE ${WINDOW}`;

/** Ties go to the earlier hour, as the app's mock does. */
export const BUSIEST_SQL = `SELECT d.local_start_hour AS hour, count(*) AS n FROM drives d
       WHERE ${WINDOW} AND d.local_start_hour IS NOT NULL
       GROUP BY d.local_start_hour ORDER BY n DESC, hour ASC LIMIT 1`;

export async function communityStats(env: Env, clock: FeedClock): Promise<CommunityStats> {
  const since = clock.windowStart;
  const until = clock.releasedUpTo;
  const [totals, busiest] = await env.DB.batch<
    { drivers: number; distance_m: number; duration_s: number } & {
      hour: number;
    }
  >([env.DB.prepare(TOTALS_SQL).bind(since, until), env.DB.prepare(BUSIEST_SQL).bind(since, until)]);
  const row = totals?.results[0];
  const drivers = row?.drivers ?? 0;
  if (drivers < MINIMUM_DRIVERS) {
    return {
      windowHours: 168,
      visible: false,
      drivers: null,
      distanceM: null,
      durationS: null,
      busiestHour: null,
      warmup: Math.floor(drivers) / MINIMUM_DRIVERS,
    };
  }
  return {
    windowHours: 168,
    visible: true,
    drivers,
    distanceM: row?.distance_m ?? 0,
    durationS: row?.duration_s ?? 0,
    busiestHour: busiest?.results[0]?.hour ?? null,
    warmup: null,
  };
}
