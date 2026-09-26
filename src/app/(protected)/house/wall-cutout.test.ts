import { describe, expect, it } from "vitest";
import { computeOpeningCutout } from "./wall-cutout";

describe("computeOpeningCutout", () => {
  it("places a cutout along an x-axis wall (north/south) at the room-relative offset", () => {
    const cutout = computeOpeningCutout({
      axis: "x",
      centerX: 5,
      centerZ: 0,
      roomX: 0,
      roomZ: 0,
      offset: 1,
      width: 0.9,
      height: 2.1,
      sillHeight: 0,
      wallThickness: 0.15,
      wallHeight: 2.8,
      yOffset: 0,
    });

    expect(cutout.size).toEqual([0.9, 2.1, 0.2]);
    expect(cutout.position).toEqual([1.45, 1.05, 0]);
  });

  it("places a cutout along a z-axis wall (east/west) at the room-relative offset", () => {
    const cutout = computeOpeningCutout({
      axis: "z",
      centerX: 4,
      centerZ: 3,
      roomX: 0,
      roomZ: 0,
      offset: 0.5,
      width: 1.2,
      height: 1.2,
      sillHeight: 0.9,
      wallThickness: 0.15,
      wallHeight: 2.8,
      yOffset: 3,
    });

    expect(cutout.size).toEqual([0.2, 1.2, 1.2]);
    expect(cutout.position).toEqual([4, 4.5, 1.1]);
  });

  it("clamps the cutout height so it never exceeds the wall above the sill", () => {
    const cutout = computeOpeningCutout({
      axis: "x",
      centerX: 0,
      centerZ: 0,
      roomX: 0,
      roomZ: 0,
      offset: 0,
      width: 1,
      height: 5, // taller than the wall itself
      sillHeight: 0,
      wallThickness: 0.15,
      wallHeight: 2.4,
      yOffset: 0,
    });

    expect(cutout.size[1]).toBe(2.4);
  });
});
