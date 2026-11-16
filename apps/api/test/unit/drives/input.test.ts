import { describe, expect, it } from "vitest";
import { checkTime, looksGeographic, parseDriveInput } from "../../../src/services/drives/input";

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

const points = Array.from({ length: 8 }, (_, i) => [i / 7, (i % 2) * 0.5]);

/** Contract 0.28.1 `DriveInput`. */
const valid = {
  revision: 3,
  startedAt: "2026-11-03T09:41:17+07:00",
  endedAt: "2026-11-03T10:37:17+07:00",
  localDate: "2026-11-03",
  localStartHour: 9,
  partOfDay: "morning",
  distanceM: 42_800,
  movingDurationS: 3000,
  elapsedDurationS: 3360,
  vehicle: { make: " Kia ", model: "K3" },
  weather: "rain",
  shape: { version: 1, points },
};

describe("parseDriveInput", () => {
  it("keeps the exact times for the server and the start's hour for the age", () => {
    expect(parseDriveInput(valid, NOW)).toEqual({
      ok: true,
      data: {
        revision: 3,
        startedAt: Date.parse(valid.startedAt),
        endedAt: Date.parse(valid.endedAt),
        droveAt: Date.UTC(2026, 10, 3, 2, 0, 0),
        localDate: "2026-11-03",
        localStartHour: 9,
        partOfDay: "morning",
        distanceM: 42_800,
        movingDurationS: 3000,
        elapsedDurationS: 3360,
        vehicle: { make: "Kia", model: "K3" },
        weather: "rain",
        shape: { version: 1, points },
      },
    });
  });

  it("accepts no shape and no car name", () => {
    const { shape: _, ...rest } = valid;
    expect(parseDriveInput({ ...rest, vehicle: { make: null, model: null } }, NOW)).toMatchObject({
      ok: true,
      data: { vehicle: { make: null, model: null }, shape: null },
    });
  });

  it("refuses malformed fields as validation, naming them", () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ revision: 0 }, "revision"],
      [{ endedAt: "yesterday" }, "endedAt"],
      [{ localStartHour: 24 }, "localStartHour"],
      [{ partOfDay: "dawn" }, "partOfDay"],
      [{ weather: "snow" }, "weather"],
      [{ vehicle: null }, "vehicle"],
      [{ vehicle: { make: "x".repeat(41) } }, "vehicle.make"],
      [{ vehicle: { make: "Kia\nK3" } }, "vehicle.make"],
      [{ shape: { version: 2, points } }, "shape"],
      [{ shape: { version: 1, points: points.slice(0, 7) } }, "shape"],
    ];
    for (const [change, field] of cases) {
      const result = parseDriveInput({ ...valid, ...change }, NOW);
      expect(result, field).toMatchObject({ ok: false, code: "validation" });
      if (!result.ok) expect(result.detail, field).toContain(field);
    }
  });

  it("refuses figures out of the contract's range as 422 out_of_range, on both sides of each bound", () => {
    for (const [change, ok] of [
      [{ distanceM: 99 }, false],
      [{ distanceM: 100 }, true],
      [{ distanceM: 2_000_001 }, false],
      [{ elapsedDurationS: 29, movingDurationS: 20 }, false],
      [{ elapsedDurationS: 30, movingDurationS: 20 }, true],
      [{ movingDurationS: 3362 }, false],
    ] as const) {
      const result = parseDriveInput({ ...valid, ...change }, NOW);
      if (ok) expect(result.ok, JSON.stringify(change)).toBe(true);
      else
        expect(result, JSON.stringify(change)).toMatchObject({
          ok: false,
          code: "unprocessable",
          reason: "out_of_range",
        });
    }
  });

  it("refuses a geographic body whole, before any other check", () => {
    const bodies = [
      { ...valid, lat: 10.7 },
      { ...valid, vehicle: { make: "Kia", model: "K3", homeCity: "Huế" } },
      { ...valid, extra: [{ deep: { Longitude: 106 } }] },
      { ...valid, polyline: "abc", revision: "not a number" },
      { ...valid, shape: { version: 1, points: [...points.slice(0, 7), [1.2, 0.5]] } },
    ];
    for (const body of bodies) {
      expect(parseDriveInput(body, NOW)).toMatchObject({ ok: false, reason: "geo_payload_rejected" });
    }
    expect(looksGeographic(valid)).toBe(false);
  });
});

describe("checkTime", () => {
  const start = NOW - 2 * HOUR;
  it("takes a drive that ended up to five minutes ahead of the server, and refuses one further", () => {
    expect(checkTime(start, NOW + 5 * 60 * 1000, "2026-11-03", NOW).ok).toBe(true);
    expect(checkTime(start, NOW + 5 * 60 * 1000 + 1, "2026-11-03", NOW).ok).toBe(false);
  });

  it("needs the end after the start and at most 24 hours later", () => {
    expect(checkTime(start, start, "2026-11-03", NOW)).toMatchObject({ ok: false, reason: "start_time_invalid" });
    expect(checkTime(start - 22 * HOUR, start + 2 * HOUR, "2026-11-02", NOW).ok).toBe(true);
    expect(checkTime(start - 22 * HOUR - 1, start + 2 * HOUR, "2026-11-02", NOW).ok).toBe(false);
  });

  it("refuses a start in the future, over a year old, or a local day too far from it", () => {
    expect(checkTime(NOW + 6 * 60 * 1000, NOW + 7 * 60 * 1000, "2026-11-03", NOW).ok).toBe(false);
    expect(checkTime(NOW - 367 * 24 * HOUR, NOW - 366 * 24 * HOUR, "2025-11-01", NOW).ok).toBe(false);
    expect(checkTime(start, NOW, "2026-11-05", NOW).ok).toBe(false);
    expect(checkTime(start, NOW, "2026-11-02", NOW).ok).toBe(true);
  });
});
