import { Hono } from "hono";
import { requireAccount, requireAssertion } from "../http/auth";
import type { AppEnv } from "../http/context";
import { byKey, rateLimit } from "../http/rate-limit";
import { failure } from "../http/respond";
import { parseDriveInput } from "../services/drives/input";
import { parseTripId, publishDrive, unpublishDrive } from "../services/drives/publish";

/** `/v1/feed/drives/{tripId}`: publishing a car drive to the Feed (carodo-ios ADR 0007, 0010). */
export const driveRoutes = new Hono<AppEnv>();

// Cheapest first (cost C6): the access token is one HMAC and a read by key; the assertion a read and
// an ECDSA verify; then the per-key write limit.
driveRoutes.use("/v1/feed/drives/:tripId", requireAccount, requireAssertion(16 * 1024), rateLimit("RL_WRITE", byKey));

driveRoutes.put("/v1/feed/drives/:tripId", async (c) => {
  const now = Date.now();
  const tripId = parseTripId(c.req.param("tripId"));
  if (!tripId.ok) return failure(c, tripId);
  const drive = parseDriveInput(c.var.body?.json(), now);
  if (!drive.ok) return failure(c, drive);
  const result = await publishDrive(
    c.env,
    c.var.account as NonNullable<typeof c.var.account>,
    tripId.data,
    drive.data,
    now,
  );
  if (!result.ok) return failure(c, result);
  return c.body(null, 204);
});

driveRoutes.delete("/v1/feed/drives/:tripId", async (c) => {
  const tripId = parseTripId(c.req.param("tripId"));
  if (!tripId.ok) return failure(c, tripId);
  const result = await unpublishDrive(
    c.env,
    c.var.account as NonNullable<typeof c.var.account>,
    tripId.data,
    c.req.query("revision"),
    Date.now(),
  );
  if (!result.ok) return failure(c, result);
  return c.body(null, 204);
});
