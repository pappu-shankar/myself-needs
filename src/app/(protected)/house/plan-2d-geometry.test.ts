import { describe, expect, it } from "vitest";
import {
  computePlanFootprint,
  computeOpeningSegment,
  normalizeRect,
  snapToGrid,
} from "./plan-2d-geometry";

describe("computePlanFootprint", () => {
  it("returns null for no rooms", () => {
    expect(computePlanFootprint([])).toBeNull();
  });

  it("computes the union bounding box across rooms", () => {
    const footprint = computePlanFootprint([
      { x: 0, z: 0, width: 4, depth: 3 },
      { x: 4, z: -1, width: 5, depth: 6 },
    ]);

    expect(footprint).toEqual({ minX: 0, minY: -1, maxX: 9, maxY: 5 });
  });
});

describe("computeOpeningSegment", () => {
  const room = { x: 2, z: 3, width: 5, depth: 4 };

  it("places a north-wall opening along the room's top edge", () => {
    expect(computeOpeningSegment(room, { wall: "north", offset: 1, width: 0.9 })).toEqual({
      x1: 3,
      y1: 3,
      x2: 3.9,
      y2: 3,
    });
  });

  it("places a south-wall opening along the room's bottom edge", () => {
    expect(computeOpeningSegment(room, { wall: "south", offset: 1, width: 0.9 })).toEqual({
      x1: 3,
      y1: 7,
      x2: 3.9,
      y2: 7,
    });
  });

  it("places a west-wall opening along the room's left edge", () => {
    expect(computeOpeningSegment(room, { wall: "west", offset: 0.5, width: 1.2 })).toEqual({
      x1: 2,
      y1: 3.5,
      x2: 2,
      y2: 4.7,
    });
  });

  it("places an east-wall opening along the room's right edge", () => {
    expect(computeOpeningSegment(room, { wall: "east", offset: 0.5, width: 1.2 })).toEqual({
      x1: 7,
      y1: 3.5,
      x2: 7,
      y2: 4.7,
    });
  });
});

describe("normalizeRect", () => {
  it("handles a drag from top-left to bottom-right", () => {
    expect(normalizeRect(1, 1, 4, 3)).toEqual({ x: 1, y: 1, width: 3, height: 2 });
  });

  it("handles a drag from bottom-right to top-left", () => {
    expect(normalizeRect(4, 3, 1, 1)).toEqual({ x: 1, y: 1, width: 3, height: 2 });
  });
});

describe("snapToGrid", () => {
  it("rounds to the nearest 0.1 by default", () => {
    expect(snapToGrid(1.24)).toBeCloseTo(1.2);
    expect(snapToGrid(1.26)).toBeCloseTo(1.3);
  });

  it("supports a custom grid size", () => {
    expect(snapToGrid(1.24, 0.5)).toBeCloseTo(1.0);
    expect(snapToGrid(1.26, 0.5)).toBeCloseTo(1.5);
  });
});
