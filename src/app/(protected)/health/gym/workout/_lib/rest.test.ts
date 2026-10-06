import { describe, expect, it } from "vitest";
import {
  adjustRest,
  parseStoredRest,
  remainingSec,
  restProgress,
  restSecondsFor,
  shouldRestAfter,
  startRest,
  supersetBlocks,
} from "./rest";

const NOW = 1_700_000_000_000;

describe("rest timer math", () => {
  it("rounds the remaining time up and never goes below zero", () => {
    expect(remainingSec(NOW + 90_000, NOW)).toBe(90);
    expect(remainingSec(NOW + 89_001, NOW)).toBe(90);
    expect(remainingSec(NOW + 1, NOW)).toBe(1);
    expect(remainingSec(NOW, NOW)).toBe(0);
    expect(remainingSec(NOW - 5_000, NOW)).toBe(0);
  });

  it("starts a countdown, or none for a 0 s rest", () => {
    expect(startRest(1, 7, 90, NOW)).toEqual({
      workoutId: 1,
      setId: 7,
      endAt: NOW + 90_000,
      totalSec: 90,
    });
    expect(startRest(1, 7, 0, NOW)).toBeNull();
    expect(startRest(1, 7, Number.NaN, NOW)).toBeNull();
  });

  it("adds and removes 15 s, ending the timer when shortened past now", () => {
    const timer = startRest(1, 7, 90, NOW)!;
    const longer = adjustRest(timer, 15, NOW + 30_000)!;
    expect(longer.endAt).toBe(NOW + 105_000);
    expect(longer.totalSec).toBe(105);
    expect(remainingSec(longer.endAt, NOW + 30_000)).toBe(75);

    const shorter = adjustRest(timer, -15, NOW)!;
    expect(shorter.endAt).toBe(NOW + 75_000);
    expect(adjustRest(timer, -15, NOW + 80_000)).toBeNull();
  });

  it("adds time from now once a timer has already run out", () => {
    const timer = startRest(1, 7, 30, NOW)!;
    expect(adjustRest(timer, 15, NOW + 60_000)!.endAt).toBe(NOW + 75_000);
  });

  it("reports progress from 0 to 1", () => {
    const timer = startRest(1, 7, 100, NOW)!;
    expect(restProgress(timer, NOW)).toBe(0);
    expect(restProgress(timer, NOW + 25_000)).toBeCloseTo(0.25);
    expect(restProgress(timer, NOW + 500_000)).toBe(1);
  });

  it("only trusts a well-formed stored timer", () => {
    const timer = startRest(3, 9, 60, NOW)!;
    expect(parseStoredRest(JSON.stringify(timer))).toEqual(timer);
    expect(parseStoredRest(null)).toBeNull();
    expect(parseStoredRest("not json")).toBeNull();
    expect(parseStoredRest(JSON.stringify({ workoutId: 3, endAt: "soon" }))).toBeNull();
    expect(parseStoredRest("null")).toBeNull();
  });

  it("uses the entry's rest, else the default", () => {
    expect(restSecondsFor({ restSec: 180 }, 90)).toBe(180);
    expect(restSecondsFor({ restSec: 0 }, 90)).toBe(0);
    expect(restSecondsFor({ restSec: null }, 90)).toBe(90);
  });
});

function entry(id: number, supersetGroup: number | null, done: boolean[]) {
  return { id, supersetGroup, sets: done.map((completed) => ({ completed })) };
}

describe("superset blocks", () => {
  it("groups only adjacent entries sharing a group", () => {
    const blocks = supersetBlocks([
      entry(1, null, []),
      entry(2, 5, []),
      entry(3, 5, []),
      entry(4, null, []),
      entry(5, 5, []),
    ]);
    expect(blocks.map((b) => [b.group, b.entries.map((e) => e.id)])).toEqual([
      [null, [1]],
      [5, [2, 3]],
      [null, [4]],
      // A lone member of a group is just an exercise.
      [null, [5]],
    ]);
  });
});

describe("superset rest rule", () => {
  it("always rests after an exercise outside a superset", () => {
    expect(shouldRestAfter([entry(1, null, [true, false])], 1)).toBe(true);
  });

  it("skips rest while a later superset member still has sets, rests after the last member", () => {
    const entries = [entry(1, 2, [true, false, false]), entry(2, 2, [false, false, false])];
    expect(shouldRestAfter(entries, 1)).toBe(false);
    expect(shouldRestAfter(entries, 2)).toBe(true);
  });

  it("rests between sets once the later members are finished", () => {
    const entries = [entry(1, 2, [true, true, true, false]), entry(2, 2, [true, true, true])];
    expect(shouldRestAfter(entries, 1)).toBe(true);
  });

  it("handles three-way supersets", () => {
    const entries = [entry(1, 4, [false]), entry(2, 4, [false]), entry(3, 4, [false])];
    expect(shouldRestAfter(entries, 1)).toBe(false);
    expect(shouldRestAfter(entries, 2)).toBe(false);
    expect(shouldRestAfter(entries, 3)).toBe(true);
  });

  it("rests for an unknown entry rather than silently skipping", () => {
    expect(shouldRestAfter([entry(1, 2, [false]), entry(2, 2, [false])], 99)).toBe(true);
  });
});
