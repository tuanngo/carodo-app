import { Hono } from "hono";
import { problem } from "./problem";

/**
 * The HTTP transport for the iOS app. A route authenticates, applies a rate limit, calls a
 * service and maps its result; no rule lives here (docs/decisions/0001).
 */
export const app = new Hono<{ Bindings: Env }>();

app.notFound((c) => problem(c, 404, "not_found", "Not Found"));

app.onError((error, c) => {
  console.error(JSON.stringify({ message: "unhandled error", path: c.req.path, error: error.message }));
  return problem(c, 500, "internal", "Internal Server Error");
});
