import { DAY_MS, HOUR_MS, MINUTE_MS } from "../../lib/time/units";
import { publicHour } from "../shared/coarse-time";
import { instant, integerIn, isRecord, labelText, numberIn, localDate as parseLocalDate } from "../shared/input";
import { fail, ok, type Result } from "../shared/result";

/**
 * `DriveInput` (contract `PUT /v1/feed/drives/{tripId}`): what the Feed may know about one car
 * drive, never a route, a place or a speed (carodo-ios ADR 0007). Validated by hand (ADR 0003);
 * times checked as ADR 0007 says. Malformed is 400 (`validation`); well formed but implausible is
 * 422 (`start_time_invalid`, `out_of_range`, `geo_payload_rejected`).
 */

export const PARTS_OF_DAY = ["early_morning", "morning", "midday", "afternoon", "evening", "night", "late_night"];
export const WEATHER = ["rain", "clear", "unknown"];

/** The figures a drive may have (contract `DriveInput`). */
export const RANGES = {
  distanceM: [100, 2_000_000],
  elapsedDurationS: [30, 86_400],
} as const;

export interface DriveFields {
  revision: number;
  /** As the device sent it: the server's own logic only, never in a response. */
  startedAt: number;
  endedAt: number;
  /** publicHour(startedAt): the drive's age. */
  droveAt: number;
  localDate: string;
  localStartHour: number;
  partOfDay: string;
  distanceM: number;
  movingDurationS: number;
  elapsedDurationS: number;
  vehicle: { make: string | null; model: string | null };
  weather: string;
  /** DriveShape as sent, already checked; stored as given. */
  shape: { version: 1; points: number[][] } | null;
}

/**
 * A key that names a position, at any depth (contract: lat, lng, lon, latitude, longitude,
 * coordinates, address, city, geohash, polyline; and the app mock's few more). Matched anywhere in
 * the key, case-insensitively, as `LocalFeedServer` does on the device.
 */
const GEOGRAPHIC_KEY =
  /(lat|lng|lon|longitude|latitude|altitude|coordinates|heading|course|placename|placelabel|address|city|geohash|polyline|wkt|wkb)/i;

/** Whether the body names a position anywhere, or carries a shape point outside the unit box. */
export function looksGeographic(value: unknown, depth = 0): boolean {
  // The body is capped at 16 KiB, so the depth is too; past this it is refused anyway.
  if (depth > 16) return true;
  if (Array.isArray(value)) return value.some((item) => looksGeographic(item, depth + 1));
  if (!isRecord(value)) return false;
  for (const [key, nested] of Object.entries(value)) {
    if (GEOGRAPHIC_KEY.test(key)) return true;
    if (key === "shape" && isRecord(nested) && Array.isArray(nested.points)) {
      const outside = nested.points.some(
        (point) => Array.isArray(point) && point.some((n) => typeof n === "number" && (n < 0 || n > 1)),
      );
      if (outside) return true;
    }
    if (looksGeographic(nested, depth + 1)) return true;
  }
  return false;
}

export function parseDriveInput(body: unknown, now: number): Result<DriveFields> {
  if (!isRecord(body)) return fail("validation", "The body must be a JSON object.");
  // First: a geographic body is refused whole, whatever else is wrong with it.
  if (looksGeographic(body)) {
    return fail("unprocessable", "The body names a place or a position.", "geo_payload_rejected");
  }

  const revision = integerIn(body.revision, "revision", 1, Number.MAX_SAFE_INTEGER);
  if (!revision.ok) return revision;
  const startedAt = instant(body.startedAt, "startedAt");
  if (!startedAt.ok) return startedAt;
  const endedAt = instant(body.endedAt, "endedAt");
  if (!endedAt.ok) return endedAt;
  const day = parseLocalDate(body.localDate, "localDate");
  if (!day.ok) return day;
  const hour = integerIn(body.localStartHour, "localStartHour", 0, 23);
  if (!hour.ok) return hour;
  if (!PARTS_OF_DAY.includes(body.partOfDay as string)) {
    return fail("validation", "partOfDay is not one of the parts of day.");
  }
  if (!WEATHER.includes(body.weather as string)) return fail("validation", "weather must be rain, clear or unknown.");
  const distanceM = numberIn(body.distanceM, "distanceM", 0, Number.MAX_VALUE);
  if (!distanceM.ok) return distanceM;
  const elapsed = numberIn(body.elapsedDurationS, "elapsedDurationS", 0, Number.MAX_VALUE);
  if (!elapsed.ok) return elapsed;
  const moving = numberIn(body.movingDurationS, "movingDurationS", 0, Number.MAX_VALUE);
  if (!moving.ok) return moving;
  const vehicle = parseVehicle(body.vehicle);
  if (!vehicle.ok) return vehicle;
  const shape = parseShape(body.shape);
  if (!shape.ok) return shape;

  const range = checkRanges(distanceM.data, elapsed.data, moving.data);
  if (!range.ok) return range;
  const time = checkTime(startedAt.data, endedAt.data, day.data, now);
  if (!time.ok) return time;

  return ok({
    revision: revision.data,
    startedAt: startedAt.data,
    endedAt: endedAt.data,
    droveAt: publicHour(startedAt.data),
    localDate: day.data,
    localStartHour: hour.data,
    partOfDay: body.partOfDay as string,
    distanceM: distanceM.data,
    movingDurationS: moving.data,
    elapsedDurationS: elapsed.data,
    vehicle: vehicle.data,
    weather: body.weather as string,
    shape: shape.data,
  });
}

function checkRanges(distanceM: number, elapsedS: number, movingS: number): Result<null> {
  const [minDistance, maxDistance] = RANGES.distanceM;
  const [minElapsed, maxElapsed] = RANGES.elapsedDurationS;
  if (distanceM < minDistance || distanceM > maxDistance) {
    return fail("unprocessable", `distanceM must be between ${minDistance} and ${maxDistance}.`, "out_of_range");
  }
  if (elapsedS < minElapsed || elapsedS > maxElapsed) {
    return fail("unprocessable", `elapsedDurationS must be between ${minElapsed} and ${maxElapsed}.`, "out_of_range");
  }
  if (movingS > elapsedS + 1) {
    return fail("unprocessable", "movingDurationS cannot be longer than elapsedDurationS.", "out_of_range");
  }
  return ok(null);
}

/**
 * ADR 0007: not ahead of the server, not over a year old, within a day of its own local date; it
 * ends after it starts, at most 24 hours later, and not ahead of the server either.
 */
export function checkTime(startedAt: number, endedAt: number, day: string, now: number): Result<null> {
  const reason = "start_time_invalid";
  if (startedAt > now + 5 * MINUTE_MS) return fail("unprocessable", "startedAt is in the future.", reason);
  if (startedAt < now - 366 * DAY_MS) return fail("unprocessable", "startedAt is more than a year old.", reason);
  if (endedAt <= startedAt || endedAt - startedAt > 24 * HOUR_MS) {
    return fail("unprocessable", "endedAt must be after startedAt and at most 24 hours later.", reason);
  }
  if (endedAt > now + 5 * MINUTE_MS) return fail("unprocessable", "endedAt is in the future.", reason);
  // No time zone is more than 14 hours from UTC, so the local day is the UTC day or one beside it.
  const utcDay = Date.parse(`${new Date(startedAt).toISOString().slice(0, 10)}T00:00:00Z`);
  const localDay = Date.parse(`${day}T00:00:00Z`);
  if (Math.abs(localDay - utcDay) > DAY_MS) {
    return fail("unprocessable", "localDate is more than a day from startedAt.", reason);
  }
  return ok(null);
}

/** A `VehicleLabel`: make and model only, 1–40 printable characters each, or null. */
export function parseVehicle(value: unknown): Result<DriveFields["vehicle"]> {
  if (!isRecord(value)) return fail("validation", "vehicle must be an object.");
  const make = labelText(value.make, "vehicle.make", 40);
  if (!make.ok) return make;
  const model = labelText(value.model, "vehicle.model", 40);
  if (!model.ok) return model;
  return ok({ make: make.data, model: model.data });
}

/** A `DriveShape`: version 1, 8 to 64 points in the unit box (one outside it is geographic, above). */
function parseShape(value: unknown): Result<DriveFields["shape"]> {
  if (value === undefined || value === null) return ok(null);
  const refused = fail("validation", "shape must be { version: 1, points: 8 to 64 [x, y] pairs from 0 to 1 }.");
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.points)) return refused;
  const points = value.points;
  const valid =
    points.length >= 8 &&
    points.length <= 64 &&
    points.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        point.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1),
    );
  if (!valid) return refused;
  return ok({ version: 1, points: points as number[][] });
}
