import { describe, expect, it } from "vitest";
import { agoBucket, publicHour } from "../../../src/services/shared/coarse-time";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 3, 12, 20);

describe("publicHour", () => {
  it("keeps only the hour", () => {
    expect(publicHour(Date.UTC(2026, 10, 3, 7, 59, 59, 999))).toBe(Date.UTC(2026, 10, 3, 7));
    expect(publicHour(Date.UTC(2026, 10, 3, 7))).toBe(Date.UTC(2026, 10, 3, 7));
  });
});

describe("agoBucket", () => {
  it("is never finer than an hour, and coarser as it ages", () => {
    const hour = Date.UTC(2026, 10, 3, 12);
    expect(agoBucket(hour, NOW)).toBe("now");
    expect(agoBucket(hour + HOUR, NOW)).toBe("now"); // a clock ahead: never negative
    expect(agoBucket(hour - HOUR, NOW)).toBe("1h");
    expect(agoBucket(NOW - 5 * HOUR, NOW)).toBe("5h");
    expect(agoBucket(NOW - 2 * DAY, NOW)).toBe("2d");
    expect(agoBucket(NOW - 15 * DAY, NOW)).toBe("2w");
    expect(agoBucket(NOW - 100 * DAY, NOW)).toBe("3mo");
    expect(agoBucket(NOW - 800 * DAY, NOW)).toBe("2y");
  });

  it('calls a drive that ended in the last hour "now", however long ago it started', () => {
    const twoHoursAgo = Date.UTC(2026, 10, 3, 10);
    expect(agoBucket(twoHoursAgo, NOW, NOW - 10 * 60_000)).toBe("now");
    expect(agoBucket(twoHoursAgo, NOW, NOW - 61 * 60_000)).toBe("2h");
    expect(agoBucket(Date.UTC(2026, 10, 3, 4), NOW, NOW - 5 * 60_000)).toBe("now"); // a long drive
  });
});
