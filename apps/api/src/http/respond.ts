import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { sha256, toBase64Url, utf8 } from "../lib/encoding/bytes";
import type { FailureCode, Result } from "../services/shared/result";
import type { AppEnv } from "./context";
import { problem } from "./problem";

/** The one place a service's failure becomes an HTTP status (ADR 0001). */
const failures: Record<FailureCode, { status: ContentfulStatusCode; title: string }> = {
  validation: { status: 400, title: "Bad Request" },
  unauthorized: { status: 401, title: "Unauthorized" },
  forbidden: { status: 403, title: "Forbidden" },
  not_found: { status: 404, title: "Not Found" },
  conflict: { status: 409, title: "Conflict" },
  unprocessable: { status: 422, title: "Unprocessable Content" },
  too_many: { status: 429, title: "Too Many Requests" },
};

/** A failed result as its problem document; the route answers a success itself. */
export function failure(c: Context<AppEnv>, result: Extract<Result<unknown>, { ok: false }>) {
  const { status, title } = failures[result.code];
  return problem(c, status, result.reason ?? result.code, title, result.detail);
}

/**
 * A JSON read with an ETag (rule 5, cost C9): the app sends it back as `If-None-Match` and gets a
 * 304 with no body when nothing changed. `private, no-cache` by default: the app's cache keeps it
 * and asks first. A read that is the same for every guest passes `public, max-age=…` (contract
 * `GET /v1/feed`); a member's own page stays private.
 */
export async function jsonWithETag(
  c: Context<AppEnv>,
  json: string,
  cacheControl = "private, no-cache",
): Promise<Response> {
  const etag = `"${toBase64Url((await sha256(utf8(json))).slice(0, 16))}"`;
  c.header("etag", etag);
  c.header("cache-control", cacheControl);
  const asked = c.req.header("if-none-match");
  if (asked?.split(",").some((tag) => tag.trim().replace(/^W\//, "") === etag)) {
    return c.body(null, 304);
  }
  return c.body(json, 200, { "content-type": "application/json" });
}
