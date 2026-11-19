import { describe, expect, it } from "vitest";
import { agoLabel, FEED_WINDOW_MS, feedClock, isQuarter } from "../../../src/services/shared/coarse-time";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const at = (hour: number, minute: number, second = 0, ms = 0) => Date.UTC(2026, 10, 3, hour, minute, second, ms);
const AGO = /^(now|[1-9]h|1[0-9]h|2[0-3]h|[1-6]d)$/;

describe("isQuarter", () => {
  it("is true only on :00, :15, :30 and :45 with no seconds", () => {
    for (const minute of [0, 15, 30, 45]) expect(isQuarter(at(10, minute))).toBe(true);
    expect(isQuarter(at(10, 37))).toBe(false);
    expect(isQuarter(at(10, 45, 0, 1))).toBe(false);
    expect(isQuarter(at(10, 45, 1))).toBe(false);
  });
});

describe("feedClock", () => {
  it("releases a drive at the quarter after the one it ended in", () => {
    const ended = at(10, 30); // ended 10:37, sent as 10:30
    expect(feedClock(at(10, 44, 59, 999)).releasedUpTo).toBe(at(10, 15));
    expect(feedClock(at(10, 44, 59, 999)).releasedUpTo).toBeLessThan(ended);
    expect(feedClock(at(10, 45)).releasedUpTo).toBe(ended);
    expect(feedClock(at(10, 45)).quarter).toBe(at(10, 45));
  });

  it("opens the 7-day window on a quarter", () => {
    expect(FEED_WINDOW_MS).toBe(168 * HOUR);
    expect(feedClock(at(10, 45)).windowStart).toBe(at(10, 45) - 168 * HOUR);
    expect(feedClock(at(10, 59, 59, 999)).windowStart).toBe(at(10, 45) - 168 * HOUR);
  });
});

describe("agoLabel", () => {
  const ended = at(10, 30);
  const release = ended + 15 * MINUTE;

  it('says "now" before the release and for an hour after it', () => {
    expect(agoLabel(ended, at(10, 40))).toBe("now");
    expect(agoLabel(ended, release)).toBe("now");
    expect(agoLabel(ended, release + HOUR - 1)).toBe("now");
  });

  it("counts hours, then days, from the release", () => {
    expect(agoLabel(ended, release + HOUR)).toBe("1h");
    expect(agoLabel(ended, release + 23 * HOUR)).toBe("23h");
    expect(agoLabel(ended, release + DAY)).toBe("1d");
    expect(agoLabel(ended, release + 6 * DAY)).toBe("6d");
    expect(agoLabel(ended, ended + 7 * DAY)).toBe("6d");
    expect(agoLabel(ended, ended + 30 * DAY)).toBe("6d");
  });

  it("always matches the contract's Ago", () => {
    for (let elapsed = -HOUR; elapsed <= 8 * DAY; elapsed += 7 * MINUTE)
      expect(agoLabel(ended, ended + elapsed)).toMatch(AGO);
  });
});
