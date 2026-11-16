/**
 * Analytics Engine data points (docs/metrics.md). Writing one is not awaited and costs next to no
 * CPU; Cloudflare samples at volume. The positions of blobs and doubles are append-only: a field
 * is never moved, renamed or reused, only added at the end. Never an account id, a key id, a
 * token, a coordinate or an address.
 */

/** One request: `carodo_metrics` (METRICS). */
export interface RequestMetric {
  /** The route pattern, never the URL (`/v1/shares/:token`, not the token). */
  route: string;
  method: string;
  /** The Problem's code, or "ok". */
  outcome: string;
  colo: string;
  country: string;
  status: number;
  durationMs: number;
}

export function writeRequestMetric(dataset: AnalyticsEngineDataset, metric: RequestMetric): void {
  dataset.writeDataPoint({
    indexes: [metric.route],
    // blob1 route, blob2 method, blob3 outcome, blob4 colo, blob5 country
    blobs: [metric.route, metric.method, metric.outcome, metric.colo, metric.country],
    // double1 status, double2 duration in ms
    doubles: [metric.status, metric.durationMs],
  });
}

/** Something that happened in the product: `carodo_events` (EVENTS). */
export type EventName =
  | "key.attested"
  | "account.created"
  | "account.deleted"
  | "account.erased"
  | "account.renamed"
  | "sharing.on"
  | "sharing.off"
  | "drive.published"
  | "drive.unpublished"
  | "reaction.set";

export function writeEvent(dataset: AnalyticsEngineDataset, name: EventName, detail = "", value = 1): void {
  dataset.writeDataPoint({
    indexes: [name],
    // blob1 event, blob2 detail (a category, e.g. an App Attest environment)
    blobs: [name, detail],
    // double1 value (1 for a count; a size or a distance for events that carry one)
    doubles: [value],
  });
}
