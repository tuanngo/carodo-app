import { deriveHmacKey, LABEL_USERNAME_HOLD } from "../../lib/crypto/secret-key";
import { utf8 } from "../../lib/encoding/bytes";
import { DAY_MS } from "../../lib/time/units";
import { fail, ok, type Result } from "../shared/result";

/**
 * Usernames (carodo-ios ADR 0008, contract `Username`): 3–20 of a-z, 0-9, "_" and ".", not
 * starting or ending with "." or "_", no ".." or "__"; unique case-insensitively, stored
 * lowercase. Refused as `reserved` when it would pass as Carodo or a part of the app (the words
 * below, and `username_policies` rows of kind reserved), as `profane` by `username_policies`
 * (seeds/username-policies.sql), as `taken` when an account has it or it is held after a deletion
 * or a rename. The one home of these rules: claim, rename and the availability check all ask here.
 */

const PATTERN = /^(?![._])(?!.*[._]$)(?!.*(\.\.|__))[a-z0-9_.]{3,20}$/;

const RESERVED = new Set([
  "about",
  "account",
  "admin",
  "administrator",
  "anonymous",
  "api",
  "app",
  "apple",
  "feed",
  "guest",
  "help",
  "leaderboard",
  "legal",
  "live",
  "me",
  "mod",
  "moderator",
  "null",
  "official",
  "privacy",
  "root",
  "security",
  "settings",
  "someone",
  "staff",
  "support",
  "system",
  "team",
  "undefined",
  "www",
  "you",
]);

/** Why a name cannot be claimed (contract `GET /v1/usernames/{username}` reason). */
export type UsernameRefusal = "invalid" | "reserved" | "profane" | "taken";

/** The refusal's Problem code (contract `Problem.code`). */
export const REFUSAL_CODES: Record<UsernameRefusal, { code: "validation" | "conflict"; reason: string }> = {
  invalid: { code: "validation", reason: "username_invalid" },
  reserved: { code: "conflict", reason: "username_reserved" },
  profane: { code: "conflict", reason: "username_profane" },
  taken: { code: "conflict", reason: "username_taken" },
};

/** The stored form of a username, or a validation failure naming the rule it breaks. */
export function normalizeUsername(value: unknown): Result<string> {
  if (typeof value !== "string") return fail("validation", "username is required.", "username_invalid");
  const username = value.toLowerCase();
  if (!PATTERN.test(username)) {
    return fail(
      "validation",
      "username must be 3 to 20 of a-z, 0-9, _ and ., not starting or ending with . or _, with no .. or __.",
      "username_invalid",
    );
  }
  return ok(username);
}

/** Reserved in code: Carodo's own name in any form, and names that read as part of the app. */
export function isReservedUsername(username: string): boolean {
  return RESERVED.has(username) || bare(username).includes("carodo");
}

/** The name as policies compare it: without "." and "_". */
function bare(username: string): string {
  return username.replaceAll(/[._]/g, "");
}

/** Every piece of the bare name a `contains` policy could be (3 letters or more), and the name itself. */
export function policyCandidates(username: string): string[] {
  const name = bare(username);
  const pieces = new Set<string>([username]);
  for (let start = 0; start < name.length; start++) {
    for (let end = start + 3; end <= name.length; end++) pieces.add(name.slice(start, end));
  }
  return [...pieces];
}

/**
 * What `username_policies` says of a valid, lowercase name, or null. One indexed query: the name's
 * pieces travel as one JSON value (at most 172 for 20 letters), and only matching rows are read.
 */
export async function policyRefusal(db: D1Database, username: string): Promise<"reserved" | "profane" | null> {
  const { results } = await db
    .prepare("SELECT name, kind, match FROM username_policies WHERE name IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(policyCandidates(username)))
    .all<{ name: string; kind: string; match: string }>();
  const whole = bare(username);
  const applies = results.filter((row) => row.match === "contains" || row.name === whole || row.name === username);
  if (applies.some((row) => row.kind === "reserved")) return "reserved";
  if (applies.some((row) => row.kind === "profane")) return "profane";
  return null;
}

/** A released name stays held this long after its account is deleted or renamed (specs/account.md). */
export const USERNAME_HOLD_MS = 90 * DAY_MS;

/** The held form of a username: HMAC of its lowercase form, linked to nothing. */
export async function usernameHoldHash(root: string, username: string): Promise<string> {
  const mac = await crypto.subtle.sign(
    "HMAC",
    await deriveHmacKey(root, LABEL_USERNAME_HOLD),
    utf8(username.toLowerCase()),
  );
  return Array.from(new Uint8Array(mac), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Whether a deleted or renamed account's name is still held. */
export async function isUsernameHeld(env: Env, username: string, now: number): Promise<boolean> {
  const row = await env.DB.prepare("SELECT 1 AS held FROM username_holds WHERE name_hash = ? AND released_at > ?")
    .bind(await usernameHoldHash(env.SECRET_KEY, username), now)
    .first();
  return row !== null;
}

/**
 * Why `value` cannot be claimed, or its stored form when it can (as far as a read can tell: the
 * insert or rename checks the account and the hold again). Cheapest first: the pattern and the
 * words in code, then the policies and the taken names together.
 */
export async function checkUsername(
  env: Env,
  value: unknown,
  now: number,
): Promise<{ username: string | null; refusal: UsernameRefusal | null }> {
  const normalized = normalizeUsername(value);
  if (!normalized.ok) return { username: null, refusal: "invalid" };
  const username = normalized.data;
  if (isReservedUsername(username)) return { username, refusal: "reserved" };
  const [policy, taken] = await Promise.all([
    policyRefusal(env.DB, username),
    takenAmong(env, [username], now).then((names) => names.size > 0),
  ]);
  return { username, refusal: policy ?? (taken ? "taken" : null) };
}

/** The names among `names` (lowercase) an account has or a hold keeps: two indexed reads, one round. */
async function takenAmong(env: Env, names: string[], now: number): Promise<Set<string>> {
  const hashes = await Promise.all(names.map((name) => usernameHoldHash(env.SECRET_KEY, name)));
  const [accounts, holds] = await env.DB.batch<{ name: string }>([
    env.DB.prepare("SELECT username AS name FROM accounts WHERE username IN (SELECT value FROM json_each(?))").bind(
      JSON.stringify(names),
    ),
    env.DB.prepare(
      "SELECT name_hash AS name FROM username_holds WHERE name_hash IN (SELECT value FROM json_each(?)) AND released_at > ?",
    ).bind(JSON.stringify(hashes), now),
  ]);
  const held = new Set((holds?.results ?? []).map((row) => row.name));
  const taken = new Set((accounts?.results ?? []).map((row) => row.name.toLowerCase()));
  for (const [i, name] of names.entries()) if (held.has(hashes[i] as string)) taken.add(name);
  return taken;
}

/**
 * Up to three free names close to a taken one (contract: "a taken name may carry suggestions"):
 * the name with a number, checked together. Never reserved or profane, since the stem passed.
 */
export async function suggestUsernames(env: Env, username: string, now: number): Promise<string[]> {
  const stem = username.slice(0, 16).replace(/[._]+$/, "");
  const numbers = new Set(Array.from(crypto.getRandomValues(new Uint16Array(6)), (n) => 10 + (n % 990)));
  const candidates = [...numbers].map((n) => `${stem}${n}`).filter((name) => normalizeUsername(name).ok);
  const taken = await takenAmong(env, candidates, now);
  return candidates.filter((name) => !taken.has(name)).slice(0, 3);
}
