import { writeEvent } from "../../lib/observability/analytics";
import type { AccountCaller } from "../auth/sessions";
import { isRecord } from "../shared/input";
import { fail, ok, type Result } from "../shared/result";

/**
 * How an account appears on the Feed (contract `Sharing`, carodo-ios ADR 0008). `displayAs` and
 * `showVehicle` apply when items are read, so a change reaches past items too. Stop sharing deletes
 * every published drive and item of the account (their reactions with them); Start sharing brings
 * none back (no backfill, ADR 0008). A drive the person hid keeps its tombstone through both, so a
 * late, older publish of it is still refused.
 */

export const DISPLAY_AS = ["anonymous", "username"] as const;
export type DisplayAs = (typeof DISPLAY_AS)[number];

export interface Sharing {
  sharing: boolean;
  displayAs: DisplayAs;
  showVehicle: boolean;
}

/** Sharing off, anonymous, the car named: an account's choices until it says otherwise. */
export const DEFAULT_SHARING: Sharing = { sharing: false, displayAs: "anonymous", showVehicle: true };

export function parseSharing(value: unknown, field = "sharing"): Result<Sharing> {
  if (!isRecord(value)) return fail("validation", `${field} must be an object.`);
  if (typeof value.sharing !== "boolean") return fail("validation", `${field}.sharing must be true or false.`);
  if (!DISPLAY_AS.includes(value.displayAs as DisplayAs)) {
    return fail("validation", `${field}.displayAs must be anonymous or username.`);
  }
  if (typeof value.showVehicle !== "boolean") return fail("validation", `${field}.showVehicle must be true or false.`);
  return ok({ sharing: value.sharing, displayAs: value.displayAs as DisplayAs, showVehicle: value.showVehicle });
}

interface SharingRow {
  feed_opt_in: number;
  display_as: string;
  show_vehicle: number;
}

export function sharingOf(row: SharingRow): Sharing {
  return {
    sharing: row.feed_opt_in === 1,
    displayAs: row.display_as === "username" ? "username" : "anonymous",
    showVehicle: row.show_vehicle === 1,
  };
}

export async function readSharing(env: Env, caller: AccountCaller): Promise<Result<Sharing>> {
  const row = await env.DB.prepare(
    "SELECT feed_opt_in, display_as, show_vehicle FROM accounts WHERE id = ? AND deleted_at IS NULL",
  )
    .bind(caller.accountId)
    .first<SharingRow>();
  if (!row) return fail("unauthorized", "The account no longer exists.");
  return ok(sharingOf(row));
}

/** Stores the choices; turning sharing off deletes the account's Feed in the same transaction. */
export async function updateSharing(
  env: Env,
  caller: AccountCaller,
  sharing: Sharing,
  now: number,
): Promise<Result<Sharing>> {
  const update = env.DB.prepare(
    "UPDATE accounts SET feed_opt_in = ?, display_as = ?, show_vehicle = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
  ).bind(sharing.sharing ? 1 : 0, sharing.displayAs, sharing.showVehicle ? 1 : 0, now, caller.accountId);
  const stop = sharing.sharing
    ? []
    : [
        env.DB.prepare("DELETE FROM drives WHERE account_id = ? AND unpublished_at IS NULL").bind(caller.accountId),
        // Tombstones have no item, so the cascade to drives leaves them.
        env.DB.prepare("DELETE FROM feed_items WHERE account_id = ?").bind(caller.accountId),
      ];
  const [updated] = await env.DB.batch([update, ...stop]);
  if (updated?.meta.changes !== 1) return fail("unauthorized", "The account no longer exists.");
  if (caller.sharing !== sharing.sharing) writeEvent(env.EVENTS, sharing.sharing ? "sharing.on" : "sharing.off");
  return ok(sharing);
}
