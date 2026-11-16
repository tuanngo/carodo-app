import { describe, expect, it } from "vitest";
import { isReservedUsername, normalizeUsername, policyCandidates } from "../../../src/services/accounts/usernames";

describe("usernames", () => {
  it("stores lowercase and keeps the contract's pattern", () => {
    expect(normalizeUsername("Road_Trip.99")).toEqual({ ok: true, data: "road_trip.99" });
    for (const bad of ["ünïcode", "a".repeat(21), "ab", ".minh", "minh_", "mi..nh", "mi__nh", "minh nguyen"]) {
      expect(normalizeUsername(bad), bad).toMatchObject({ ok: false, reason: "username_invalid" });
    }
    for (const good of ["abc", "a".repeat(20), "m.i_n.h", "x_y.z"]) expect(normalizeUsername(good).ok, good).toBe(true);
  });

  it("reserves Carodo in any spelling and the app's own words", () => {
    for (const name of ["carodo", "the_carodo", "car.odo", "support", "admin", "someone", "you"]) {
      expect(isReservedUsername(name), name).toBe(true);
    }
    expect(isReservedUsername("night_driver")).toBe(false);
  });

  it("asks policies about every piece of three letters or more, without . and _", () => {
    const pieces = policyCandidates("di.t_me");
    expect(pieces).toContain("di.t_me");
    expect(pieces).toContain("ditme");
    expect(pieces).toContain("dit");
    expect(pieces.every((piece) => piece === "di.t_me" || !/[._]/.test(piece))).toBe(true);
    expect(pieces.some((piece) => piece.length < 3)).toBe(false);
    // 20 letters: 171 pieces and the name; one JSON value, never more than D1 can take.
    expect(policyCandidates("abcdefghijklmnopqrst").length).toBeLessThanOrEqual(172);
  });
});
