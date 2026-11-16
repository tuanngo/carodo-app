import { Hono } from "hono";
import { routePath } from "hono/route";
import type { AppEnv } from "./http/context";
import { problem } from "./http/problem";
import { writeRequestMetric } from "./lib/observability/analytics";
import { logEvent } from "./lib/observability/log";
import { accountRoutes } from "./routes/accounts";
import { authRoutes } from "./routes/auth";
import { driveRoutes } from "./routes/drives";
import { feedRoutes } from "./routes/feed";

/**
 * The HTTP transport for the iOS app. A route authenticates, applies a rate limit, calls a
 * service and maps its result; no rule lives here (ADR 0001).
 */
export const app = new Hono<AppEnv>();

/**
 * One data point per request in `carodo_metrics` (docs/metrics.md), in place of invocation
 * logs: the route pattern, never the URL, so a share token is never recorded. Written after the
 * answer is decided and never awaited; a metrics failure never fails a request.
 */
app.use("*", async (c, next) => {
  const started = Date.now();
  await next();
  try {
    const route = routePath(c, -1);
    const cf = c.req.raw.cf as { colo?: string; country?: string } | undefined;
    writeRequestMetric(c.env.METRICS, {
      route: route === "/*" || route === "*" ? "(unmatched)" : route,
      method: c.req.method,
      outcome: c.var.outcome ?? (c.res.status < 400 ? "ok" : String(c.res.status)),
      colo: cf?.colo ?? "",
      country: cf?.country ?? "",
      status: c.res.status,
      durationMs: Date.now() - started,
    });
  } catch (error) {
    logEvent("warn", "metrics.write_failed", { error: error instanceof Error ? error.message : String(error) });
  }
});

app.route("/", authRoutes);
app.route("/", accountRoutes);
app.route("/", driveRoutes);
app.route("/", feedRoutes);

app.notFound((c) => problem(c, 404, "not_found", "Not Found"));

app.onError((error, c) => {
  logEvent("error", "http.unhandled", { path: routePath(c, -1), error: error.message });
  return problem(c, 500, "internal", "Internal Server Error");
});
