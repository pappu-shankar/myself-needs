import { describe, expect, it } from "vitest";
import { computeFloorOffsets, computeFootprint } from "./model";

describe("computeFloorOffsets", () => {
  it("stacks above-ground floors upward from y=0", () => {
    const offsets = computeFloorOffsets([
      { id: 1, level: 0, floorHeight: 3 },
      { id: 2, level: 1, floorHeight: 2.8 },
    ]);

    expect(offsets.get(1)).toBe(0);
    expect(offsets.get(2)).toBe(3);
  });

  it("stacks a basement downward from y=0", () => {
    const offsets = computeFloorOffsets([
      { id: 1, level: 0, floorHeight: 3 },
      { id: 2, level: -1, floorHeight: 2.5 },
    ]);

    expect(offsets.get(1)).toBe(0);
    expect(offsets.get(2)).toBe(-2.5);
  });

  it("only cares about relative level ordering, not the numeric gaps between levels", () => {
    const offsets = computeFloorOffsets([
      { id: 1, level: 0, floorHeight: 3 },
      { id: 2, level: 5, floorHeight: 2.8 },
    ]);

    expect(offsets.get(1)).toBe(0);
    expect(offsets.get(2)).toBe(3);
  });
});

describe("computeFootprint", () => {
  it("returns null for no rooms", () => {
    expect(computeFootprint([])).toBeNull();
  });

  it("computes the union bounding box across rooms", () => {
    const footprint = computeFootprint([
      { x: 0, z: 0, width: 4, depth: 3 },
      { x: 4, z: -1, width: 5, depth: 6 },
    ]);

    expect(footprint).toEqual({ minX: 0, minZ: -1, maxX: 9, maxZ: 5 });
  });
});
