import { describe, expect, it } from "vitest";
import { checkTime, looksGeographic, parseDriveInput } from "../../../src/services/drives/input";

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

const points = Array.from({ length: 8 }, (_, i) => [i / 7, (i % 2) * 0.5]);

/** Contract 0.29.0 `DriveInput`: the end on a quarter hour, minutes and 100 m. */
const valid = {
  revision: 3,
  endedAt: "2026-11-03T10:30:00+07:00",
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
  it("keeps the quarter-hour end as the only time of the drive", () => {
    expect(parseDriveInput(valid, NOW)).toEqual({
      ok: true,
      data: {
        revision: 3,
        endedAt: Date.UTC(2026, 10, 3, 3, 30),
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

  it("ignores a startedAt key: the server needs no start", () => {
    expect(parseDriveInput({ ...valid, startedAt: "2026-11-03T09:41:17+07:00" }, NOW).ok).toBe(true);
  });

  it("refuses a time or a figure the device did not round, as validation", () => {
    for (const change of [
      { endedAt: "2026-11-03T10:37:00+07:00" },
      { endedAt: "2026-11-03T10:45:01+07:00" },
      { endedAt: "2026-11-03T10:45:00.001+07:00" },
      { elapsedDurationS: 3361 },
      { movingDurationS: 30 },
      { distanceM: 12_050 },
    ]) {
      expect(parseDriveInput({ ...valid, ...change }, NOW), JSON.stringify(change)).toMatchObject({
        ok: false,
        code: "validation",
      });
    }
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
      [{ distanceM: 0 }, false],
      [{ distanceM: 100 }, true],
      [{ distanceM: 2_000_000 }, true],
      [{ distanceM: 2_000_100 }, false],
      [{ elapsedDurationS: 0, movingDurationS: 0 }, false],
      [{ elapsedDurationS: 60, movingDurationS: 60 }, true],
      [{ elapsedDurationS: 86_400 }, true],
      [{ elapsedDurationS: 86_460 }, false],
      [{ movingDurationS: 3420 }, false],
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
  const QUARTER = 15 * 60 * 1000;
  const DAY = 24 * HOUR;
  it("takes an end up to a quarter hour ahead of the server, and refuses one further", () => {
    expect(checkTime(NOW + QUARTER, "2026-11-03", NOW).ok).toBe(true);
    expect(checkTime(NOW + 2 * QUARTER, "2026-11-03", NOW)).toMatchObject({ ok: false, reason: "start_time_invalid" });
  });

  it("needs the end's UTC date within two days of the local day", () => {
    const end = Date.UTC(2026, 10, 3, 1); // 2026-11-03 UTC
    expect(checkTime(end, "2026-11-01", NOW).ok).toBe(true);
    expect(checkTime(end, "2026-11-05", NOW).ok).toBe(true);
    expect(checkTime(end, "2026-10-31", NOW)).toMatchObject({ ok: false, reason: "start_time_invalid" });
    expect(checkTime(end, "2026-11-06", NOW)).toMatchObject({ ok: false, reason: "start_time_invalid" });
  });

  it("leaves how old a drive may be to the Feed window", () => {
    expect(checkTime(NOW - 30 * DAY, "2026-10-04", NOW).ok).toBe(true);
  });
});
