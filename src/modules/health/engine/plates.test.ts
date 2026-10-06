import { describe, expect, it } from "vitest";
import { DEFAULT_PLATES_KG } from "../gym-types";
import { nearestLoadable, platesPerSide } from "./plates";

const PLATES = [...DEFAULT_PLATES_KG];

describe("platesPerSide", () => {
  it("loads heaviest plates first", () => {
    expect(platesPerSide(100, 20, PLATES)).toEqual({
      plates: [25, 15],
      loadedKg: 100,
      remainderKg: 0,
      exact: true,
    });
    expect(platesPerSide(62.5, 20, PLATES).plates).toEqual([20, 1.25]);
    expect(platesPerSide(182.5, 20, PLATES).plates).toEqual([25, 25, 25, 5, 1.25]);
  });

  it("reports what can't be made exactly", () => {
    // 41.25 kg over the bar is 20.625 a side; the smallest pair is 2.5 kg
    expect(platesPerSide(61.25, 20, PLATES)).toEqual({
      plates: [20],
      loadedKg: 60,
      remainderKg: 1.25,
      exact: false,
    });
  });

  it("handles the bar alone and targets under it", () => {
    expect(platesPerSide(20, 20, PLATES)).toEqual({
      plates: [],
      loadedKg: 20,
      remainderKg: 0,
      exact: true,
    });
    expect(platesPerSide(15, 20, PLATES)).toEqual({
      plates: [],
      loadedKg: 20,
      remainderKg: -5,
      exact: false,
    });
  });

  it("respects a limited inventory, leaving unlisted sizes unlimited", () => {
    expect(platesPerSide(140, 20, PLATES, { 25: 1 }).plates).toEqual([25, 20, 15]);
    expect(platesPerSide(60, 20, PLATES, { 20: 0 }).plates).toEqual([15, 5]);
  });

  it("does integer-gram math with fractional plates in any order", () => {
    expect(platesPerSide(21, 20, [0.25, 0.5, 0.5, 0])).toMatchObject({
      plates: [0.5],
      exact: true,
    });
    expect(platesPerSide(20.3, 20, [0.1, 0.05])).toMatchObject({
      plates: [0.1, 0.05],
      exact: true,
    });
  });
});

describe("nearestLoadable", () => {
  it("rounds down, or to the closer side with ties going down", () => {
    expect(nearestLoadable(61.25, 20, PLATES, "down")).toBe(60);
    expect(nearestLoadable(61.25, 20, PLATES, "nearest")).toBe(60);
    expect(nearestLoadable(61.5, 20, PLATES, "nearest")).toBe(62.5);
    expect(nearestLoadable(101, 20, PLATES, "nearest")).toBe(100);
    expect(nearestLoadable(100, 20, PLATES, "down")).toBe(100);
  });

  it("searches every combination, not just the greedy one", () => {
    // 30 kg a side is 15 + 15; greedy would stop at 25 and load 70
    expect(nearestLoadable(80, 20, [25, 15], "down")).toBe(80);
    expect(nearestLoadable(76, 20, [25, 15], "nearest")).toBe(80);
  });

  it("falls back to the bar when there is nothing to add", () => {
    expect(nearestLoadable(15, 20, PLATES, "nearest")).toBe(20);
    expect(nearestLoadable(80, 20, [], "down")).toBe(20);
  });
});
