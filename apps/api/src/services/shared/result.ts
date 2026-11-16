/**
 * What every service returns (ADR 0001). A service never sees a `Response` and never picks an HTTP
 * status: the transport maps `code`, so the same rule answers the same way over HTTP and WebRpc.
 */

/**
 * `validation`: malformed (400). `unprocessable`: well formed but not believable (422). `too_many`:
 * a limit a rule counts in D1 (429), not a rate limit binding's.
 */
export type FailureCode =
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "unprocessable"
  | "too_many";

/**
 * `reason`, when set, is the stable machine-readable value a client branches on (the Problem's
 * `code`, e.g. `username_taken`); without one the Problem's code is `code`.
 */
export type Result<T> = { ok: true; data: T } | { ok: false; code: FailureCode; detail?: string; reason?: string };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail(code: FailureCode, detail?: string, reason?: string): Result<never> {
  return {
    ok: false,
    code,
    ...(detail === undefined ? {} : { detail }),
    ...(reason === undefined ? {} : { reason }),
  };
}
