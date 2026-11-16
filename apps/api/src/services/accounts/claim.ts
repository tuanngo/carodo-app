import { writeEvent } from "../../lib/observability/analytics";
import { uuidv7 } from "../../lib/platform/ids";
import { AFTER_ONE_CHANGE, hashSecret, newSecretToken, prepareSession, type Tokens } from "../auth/sessions";
import { isRecord } from "../shared/input";
import { fail, ok, type Result } from "../shared/result";
import { DEFAULT_SHARING, parseSharing, type Sharing } from "./sharing";
import { checkUsername, REFUSAL_CODES, usernameHoldHash } from "./usernames";

/**
 * Claiming a username creates the account, with no sign-in (carodo-ios ADR 0008): the answer
 * holds the account secret (iCloud Keychain) and this device's first session. Sharing is off
 * unless the claim says otherwise; the app claims first and starts sharing with PUT /v1/me/sharing.
 */

export interface ClaimInput {
  /** As sent; checked by `checkUsername`. */
  username: unknown;
  sharing: Sharing;
  /** DCDevice token: lets the server read the device's ban bit; never stored. */
  deviceCheckToken: string;
}

/** Contract `Profile`. */
export interface Profile {
  id: string;
  username: string;
}

export interface Claimed {
  accountSecret: string;
  session: Tokens;
  profile: Profile;
}

/** `ProfileInput` plus `deviceCheckToken` and an optional `sharing` (contract: `POST /v1/accounts`). */
export function parseClaim(body: unknown): Result<ClaimInput> {
  if (!isRecord(body)) return fail("validation", "The body must be a JSON object.");
  let sharing = DEFAULT_SHARING;
  if (body.sharing !== undefined && body.sharing !== null) {
    const parsed = parseSharing(body.sharing);
    if (!parsed.ok) return parsed;
    sharing = parsed.data;
  }
  const token = body.deviceCheckToken;
  if (typeof token !== "string" || token.length === 0 || token.length > 8192) {
    return fail("validation", "deviceCheckToken is required.");
  }
  return ok({ username: body.username, sharing, deviceCheckToken: token });
}

export async function claimAccount(env: Env, input: ClaimInput, keyId: string, now: number): Promise<Result<Claimed>> {
  // A held name answers as taken: nobody learns that an account was deleted or renamed. This read
  // only refuses early; the insert checks the hold again, since the owner may be deleted after it.
  const checked = await checkUsername(env, input.username, now);
  if (checked.refusal !== null || checked.username === null) {
    const refusal = REFUSAL_CODES[checked.refusal ?? "invalid"];
    return fail(refusal.code, `This username cannot be claimed (${checked.refusal}).`, refusal.reason);
  }
  const username = checked.username;
  // TODO(DeviceCheck): read the device's ban bit with input.deviceCheckToken once the paid team's
  // DeviceCheck key exists (carodo-ios ADR 0009); until then no device is known to be banned.

  const accountId = uuidv7(now);
  const accountSecret = `${accountId}.${newSecretToken()}`;
  const session = await prepareSession(env, accountId, keyId, now, { guard: AFTER_ONE_CHANGE });
  const createAccount = env.DB.prepare(
    `INSERT INTO accounts (id, username, secret_hash, feed_opt_in, display_as, show_vehicle, created_at, updated_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM username_holds WHERE name_hash = ? AND released_at > ?)`,
  ).bind(
    accountId,
    username,
    await hashSecret(accountSecret),
    input.sharing.sharing ? 1 : 0,
    input.sharing.displayAs,
    input.sharing.showVehicle ? 1 : 0,
    now,
    now,
    await usernameHoldHash(env.SECRET_KEY, username),
    now,
  );

  try {
    // One transaction: never an account without its first session, nor a session without it.
    const [created] = await env.DB.batch([createAccount, session.statement]);
    if (created?.meta.changes !== 1) return fail("conflict", "This username is taken.", "username_taken");
  } catch (error) {
    if (isUsernameConflict(error)) return fail("conflict", "This username is taken.", "username_taken");
    throw error;
  }

  writeEvent(env.EVENTS, "account.created");
  return ok({ accountSecret, session: await session.issue(), profile: { id: accountId, username } });
}

/** D1's error when another account has the name (the unique index decides a race). */
export function isUsernameConflict(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed: accounts.username");
}
