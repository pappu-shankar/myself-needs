// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  LM,
  allVisible,
  distance,
  distance3d,
  elevationAngle,
  inFrame,
  inclinationFromVertical,
  isVisible,
  jointAngle,
  jointAngle3d,
  lineDeviation,
  meanVisibility,
  midpoint,
  minVisibility,
  pickSide,
  toAspectSpace,
  visibilityOf,
  type PoseLandmark,
} from "./geometry";

const p = (x: number, y: number, z = 0, visibility?: number): PoseLandmark => ({
  x,
  y,
  z,
  visibility,
});

describe("landmark indices", () => {
  it("match BlazePose's 33-point layout", () => {
    expect([LM.nose, LM.leftShoulder, LM.rightShoulder]).toEqual([0, 11, 12]);
    expect([LM.leftElbow, LM.rightElbow, LM.leftWrist, LM.rightWrist]).toEqual([13, 14, 15, 16]);
    expect([LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee]).toEqual([23, 24, 25, 26]);
    expect([LM.leftAnkle, LM.rightAnkle, LM.rightFootIndex]).toEqual([27, 28, 32]);
  });
});

describe("jointAngle", () => {
  it("measures the angle at the middle point in degrees", () => {
    expect(jointAngle(p(1, 0), p(0, 0), p(0, 1))).toBeCloseTo(90);
    expect(jointAngle(p(-1, 0), p(0, 0), p(1, 0))).toBeCloseTo(180);
    expect(jointAngle(p(1, 0), p(0, 0), p(1, 1))).toBeCloseTo(45);
    expect(jointAngle(p(1, 0), p(0, 0), p(2, 0))).toBeCloseTo(0);
  });

  it("ignores z and survives zero-length limbs", () => {
    expect(jointAngle(p(1, 0, 5), p(0, 0), p(0, 1, -3))).toBeCloseTo(90);
    expect(jointAngle(p(0, 0), p(0, 0), p(0, 1))).toBe(0);
  });

  it("has a 3-D variant that includes depth", () => {
    expect(jointAngle3d(p(1, 0, 0), p(0, 0, 0), p(0, 0, 1))).toBeCloseTo(90);
    expect(jointAngle3d(p(1, 0, 0), p(0, 0, 0), p(-1, 0, 0))).toBeCloseTo(180);
    expect(jointAngle3d(p(0, 0, 0), p(0, 0, 0), p(1, 0, 0))).toBe(0);
  });
});

describe("distance and midpoint", () => {
  it("measures 2-D and 3-D distance", () => {
    expect(distance(p(0, 0, 9), p(3, 4, 0))).toBeCloseTo(5);
    expect(distance3d(p(0, 0, 0), p(2, 3, 6))).toBeCloseTo(7);
  });

  it("gives the midpoint the weaker visibility", () => {
    expect(midpoint(p(0, 0, 0, 0.9), p(2, 4, 2, 0.4))).toEqual({
      x: 1,
      y: 2,
      z: 1,
      visibility: 0.4,
    });
  });
});

describe("orientation helpers", () => {
  it("measures inclination from vertical, 0–90°, either direction", () => {
    expect(inclinationFromVertical(p(0, 1), p(0, 0))).toBeCloseTo(0);
    expect(inclinationFromVertical(p(0, 0), p(0, 1))).toBeCloseTo(0);
    expect(inclinationFromVertical(p(0, 0), p(1, 0))).toBeCloseTo(90);
    expect(inclinationFromVertical(p(0, 0), p(-1, -1))).toBeCloseTo(45);
  });

  it("signs elevation positive when the first point is higher (smaller y)", () => {
    expect(elevationAngle(p(0, 0), p(1, 1))).toBeCloseTo(45);
    expect(elevationAngle(p(0, 1), p(1, 0))).toBeCloseTo(-45);
    expect(elevationAngle(p(0, 0.5), p(1, 0.5))).toBeCloseTo(0);
  });

  it("signs line deviation positive when the middle sags below the line", () => {
    const shoulder = p(0, 0.5);
    const ankle = p(1, 0.5);
    expect(lineDeviation(shoulder, p(0.5, 0.5), ankle)).toBeCloseTo(0);
    expect(lineDeviation(shoulder, p(0.5, 0.6), ankle)).toBeGreaterThan(20);
    expect(lineDeviation(shoulder, p(0.5, 0.4), ankle)).toBeLessThan(-20);
    // Same magnitude either way.
    expect(lineDeviation(shoulder, p(0.5, 0.6), ankle)).toBeCloseTo(
      -(lineDeviation(shoulder, p(0.5, 0.4), ankle) ?? 0),
    );
    // Sign doesn't depend on which way the person faces.
    expect(lineDeviation(ankle, p(0.5, 0.6), shoulder)).toBeGreaterThan(0);
  });

  it("refuses a vertical reference line", () => {
    expect(lineDeviation(p(0.5, 0), p(0.6, 0.5), p(0.5, 1))).toBeNull();
  });
});

describe("visibility helpers", () => {
  it("treats a missing landmark as invisible and a missing score as visible", () => {
    expect(visibilityOf(undefined)).toBe(0);
    expect(visibilityOf(p(0, 0))).toBe(1);
    expect(visibilityOf(p(0, 0, 0, 0.3))).toBe(0.3);
    expect(isVisible(p(0, 0, 0, 0.5))).toBe(true);
    expect(isVisible(p(0, 0, 0, 0.49))).toBe(false);
    expect(isVisible(p(0, 0, 0, 0.7), 0.8)).toBe(false);
  });

  it("aggregates over a list of indices", () => {
    const pose = [p(0, 0, 0, 0.9), p(0, 0, 0, 0.6), p(0, 0, 0, 0.2)];
    expect(allVisible(pose, [0, 1])).toBe(true);
    expect(allVisible(pose, [0, 2])).toBe(false);
    expect(allVisible(pose, [0, 7])).toBe(false);
    expect(minVisibility(pose, [0, 1, 2])).toBeCloseTo(0.2);
    expect(meanVisibility(pose, [0, 1])).toBeCloseTo(0.75);
    expect(minVisibility(pose, [])).toBe(1);
  });

  it("checks a landmark is inside the frame with a little slack", () => {
    expect(inFrame(p(0.5, 0.5))).toBe(true);
    expect(inFrame(p(-0.01, 1.01))).toBe(true);
    expect(inFrame(p(0.5, 1.1))).toBe(false);
    expect(inFrame(p(-0.2, 0.5))).toBe(false);
    expect(inFrame(undefined)).toBe(false);
  });
});

describe("pickSide", () => {
  const pose = [p(0, 0, 0, 0.9), p(0, 0, 0, 0.8), p(0, 0, 0, 0.3), p(0, 0, 0, 0.4)];

  it("chooses the side whose landmarks are more visible", () => {
    expect(pickSide(pose, [0, 1], [2, 3])).toEqual({
      side: "left",
      indices: [0, 1],
      visibility: expect.closeTo(0.85),
    });
    expect(pickSide(pose, [2, 3], [0, 1]).side).toBe("right");
  });

  it("prefers left on a tie", () => {
    expect(pickSide(pose, [0], [0]).side).toBe("left");
  });
});

describe("toAspectSpace", () => {
  it("restores true angles on a widescreen frame", () => {
    const aspect = 16 / 9;
    // A true 45° diagonal in a 16:9 frame: 0.1 of height right = 0.1/aspect of width.
    const raw = [p(0, 0.5), p(0.5, 0.5), p(0.5 + 0.1 / aspect, 0.4)];
    expect(jointAngle(raw[0], raw[1], raw[2])).not.toBeCloseTo(135, 0);
    const square = toAspectSpace(raw, aspect);
    expect(jointAngle(square[0], square[1], square[2])).toBeCloseTo(135);
    expect(square[1]).toEqual({ x: 0.5 * aspect, y: 0.5, z: 0, visibility: undefined });
  });
});
