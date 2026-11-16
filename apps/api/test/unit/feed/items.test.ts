import { describe, expect, it } from "vitest";
import { type DriveRow, feedItem, forReader, type ItemRow } from "../../../src/services/feed/items";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 3, 12, 20);
const AUTHOR = "0190f0a0-0000-7000-8000-000000000001";
const ITEM = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";

const item = (overrides: Partial<ItemRow> = {}): ItemRow => ({
  id: ITEM,
  account_id: AUTHOR,
  sort_hour: Date.UTC(2026, 10, 3, 9),
  username: "minh",
  display_as: "username",
  show_vehicle: 1,
  ...overrides,
});

const drive = (overrides: Partial<DriveRow> = {}): DriveRow => ({
  item_id: ITEM,
  trip_id: crypto.randomUUID(),
  vehicle_make: "Kia",
  vehicle_model: "K3",
  distance_m: 10_000,
  elapsed_duration_s: 900,
  drove_at: Date.UTC(2026, 10, 3, 7),
  ended_at: Date.UTC(2026, 10, 3, 7, 40),
  part_of_day: "morning",
  weather: "clear",
  shape: null,
  ...overrides,
});

describe("feedItem", () => {
  it("shows the day's drives newest first with the newest drive's car and age, and the totals", () => {
    const early = drive({ distance_m: 30_000 });
    const late = drive({
      vehicle_make: "Mazda",
      vehicle_model: "CX-5",
      drove_at: Date.UTC(2026, 10, 3, 9),
      ended_at: Date.UTC(2026, 10, 3, 9, 30),
      weather: "rain",
    });
    const shared = feedItem(item(), [early, late], { fire: 2 }, NOW);
    expect(shared?.item).toEqual({
      id: ITEM,
      isAuthor: false,
      displayName: "minh",
      vehicle: { make: "Mazda", model: "CX-5" },
      drives: [
        { durationS: 900, distanceM: 10_000, ago: "3h", partOfDay: "morning", weather: "rain" },
        { durationS: 900, distanceM: 30_000, ago: "5h", partOfDay: "morning" },
      ],
      totalDurationS: 1800,
      totalDistanceM: 40_000,
      ago: "3h",
      reactions: { fire: 2 },
      myReaction: null,
    });
  });

  it("follows the author's choices: anonymous is null, no vehicle names no car", () => {
    const shared = feedItem(item({ display_as: "anonymous", show_vehicle: 0 }), [drive()], {}, NOW);
    expect(shared?.item).toMatchObject({ displayName: null, vehicle: null });
  });

  it("says now for a drive that ended within the hour (coarse-time)", () => {
    const shared = feedItem(item(), [drive({ drove_at: NOW - 3 * HOUR, ended_at: NOW - 30 * 60 * 1000 })], {}, NOW);
    expect(shared?.item.ago).toBe("now");
  });

  it("carries no author id, trip id or exact time for anyone else", () => {
    const trip = drive({ shape: JSON.stringify({ version: 1, points: [[0, 0]] }) });
    const shared = feedItem(item(), [trip], {}, NOW);
    const text = JSON.stringify(forReader(shared as NonNullable<typeof shared>, "someone-else", new Map()));
    for (const secret of [AUTHOR, trip.trip_id, String(trip.ended_at), String(trip.drove_at)]) {
      expect(text).not.toContain(secret);
    }
  });

  it("is null when none of its drives is left", () => {
    expect(feedItem(item(), [], {}, NOW)).toBeNull();
  });
});

describe("forReader", () => {
  const trips = [drive(), drive()];
  const shared = feedItem(item(), trips, {}, NOW) as NonNullable<ReturnType<typeof feedItem>>;

  it("marks the reader's own item with its trips, and their reaction", () => {
    const own = forReader(shared, AUTHOR, new Map([[ITEM, "road"]]));
    expect(own).toMatchObject({ isAuthor: true, myReaction: "road" });
    expect(own.tripIds).toEqual(trips.map((trip) => trip.trip_id).sort());
  });

  it("gives a guest the shared item as it is", () => {
    expect(forReader(shared, null, new Map())).toBe(shared.item);
    expect(forReader(shared, null, new Map()).tripIds).toBeUndefined();
  });
});
