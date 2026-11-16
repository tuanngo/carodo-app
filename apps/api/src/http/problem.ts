import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "./context";

/** RFC 9457 problem details, the contract's `Problem` schema. `code` is the stable value clients read. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
}

export function problem(
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  code: string,
  title: string,
  detail?: string,
) {
  c.set("outcome", code);
  const body: Problem = { type: "about:blank", title, status, code, ...(detail ? { detail } : {}) };
  return c.body(JSON.stringify(body), status, { "content-type": "application/problem+json" });
}
