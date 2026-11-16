import { type Bytes, fromBase64 } from "../../lib/encoding/bytes";
import { fail, ok, type Result } from "./result";

/**
 * Small hand-written checks every validator shares (ADR 0003): each names the field it refuses and
 * bounds what it accepts before decoding it.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringField(body: Record<string, unknown>, field: string, maxLength: number): Result<string> {
  const value = body[field];
  if (typeof value !== "string" || value.length === 0) return fail("validation", `${field} is required.`);
  if (value.length > maxLength) return fail("validation", `${field} is too long.`);
  return ok(value);
}

/** A standard base64 field, decoded, with at most `maxBytes` (or exactly `exactBytes`). */
export function base64Field(
  body: Record<string, unknown>,
  field: string,
  limits: { maxBytes: number; exactBytes?: number },
): Result<Bytes> {
  const text = stringField(body, field, Math.ceil(limits.maxBytes / 3) * 4);
  if (!text.ok) return text;
  let bytes: Bytes;
  try {
    bytes = fromBase64(text.data);
  } catch {
    return fail("validation", `${field} is not base64.`);
  }
  if (limits.exactBytes !== undefined && bytes.length !== limits.exactBytes) {
    return fail("validation", `${field} must be ${limits.exactBytes} bytes.`);
  }
  return ok(bytes);
}

/** A finite number within [min, max]. */
export function numberIn(value: unknown, field: string, min: number, max: number): Result<number> {
  if (typeof value !== "number" || !Number.isFinite(value)) return fail("validation", `${field} must be a number.`);
  if (value < min || value > max) return fail("validation", `${field} must be between ${min} and ${max}.`);
  return ok(value);
}

/** A whole number within [min, max]. */
export function integerIn(value: unknown, field: string, min: number, max: number): Result<number> {
  if (!Number.isSafeInteger(value)) return fail("validation", `${field} must be a whole number.`);
  return numberIn(value, field, min, max);
}

/** A calendar day `YYYY-MM-DD` that exists, as the device wrote it. */
export function localDate(value: unknown, field: string): Result<string> {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fail("validation", `${field} must be a date (YYYY-MM-DD).`);
  }
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
    return fail("validation", `${field} is not a calendar date.`);
  }
  return ok(value);
}

/** An RFC 3339 instant with its offset (`Z` or `±hh:mm`), as Unix milliseconds. */
export function instant(value: unknown, field: string): Result<number> {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    return fail("validation", `${field} must be an RFC 3339 date-time with an offset.`);
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return fail("validation", `${field} is not a valid date-time.`);
  return ok(ms);
}

/** Control characters and bidirectional overrides: they disguise a text as another. */
const DISGUISING = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;

export function isDisguising(text: string): boolean {
  return DISGUISING.test(text);
}

/** A short label (a car's make, a province): trimmed, bounded, nothing that disguises it. */
export function labelText(value: unknown, field: string, maxLength: number): Result<string | null> {
  if (value === undefined || value === null) return ok(null);
  if (typeof value !== "string") return fail("validation", `${field} must be a string or null.`);
  const trimmed = value.trim();
  if (trimmed.length === 0) return ok(null);
  if ([...trimmed].length > maxLength) return fail("validation", `${field} is too long.`);
  if (DISGUISING.test(trimmed)) return fail("validation", `${field} contains characters that are not allowed.`);
  return ok(trimmed);
}
