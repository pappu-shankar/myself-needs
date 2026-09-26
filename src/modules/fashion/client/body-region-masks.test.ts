import { describe, expect, it } from "vitest";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { deriveBodyRegionMasks } from "./body-region-masks";

const WIDTH = 100;
const HEIGHT = 200;

function landmark(x: number, y: number): NormalizedLandmark {
  return { x, y, z: 0, visibility: 1 };
}

function makeLandmarks(overrides: Record<number, NormalizedLandmark>): NormalizedLandmark[] {
  const landmarks: NormalizedLandmark[] = Array.from({ length: 33 }, () => landmark(0.5, 0.5));
  for (const [index, value] of Object.entries(overrides)) {
    landmarks[Number(index)] = value;
  }
  return landmarks;
}

// shoulders at y=0.2 (11/12), elbows at y=0.35 (13/14), hips at y=0.5
// (23/24), knees at y=0.7 (25/26), ankles at y=0.9 (27/28)
const BASE_LANDMARKS = makeLandmarks({
  11: landmark(0.3, 0.2),
  12: landmark(0.7, 0.2),
  13: landmark(0.25, 0.35),
  14: landmark(0.75, 0.35),
  23: landmark(0.35, 0.5),
  24: landmark(0.65, 0.5),
  25: landmark(0.37, 0.7),
  26: landmark(0.63, 0.7),
  27: landmark(0.4, 0.9),
  28: landmark(0.6, 0.9),
});

function fullPersonMask(): Uint8Array {
  return new Uint8Array(WIDTH * HEIGHT).fill(1);
}

describe("deriveBodyRegionMasks", () => {
  it("marks the shirt band between shoulders and the waist line (a bit below the hip), and nothing else at the torso's center column", () => {
    const { shirtMask } = deriveBodyRegionMasks(BASE_LANDMARKS, fullPersonMask(), WIDTH, HEIGHT);

    const shoulderRow = Math.round(0.2 * HEIGHT) + 2; // just below the shoulder line
    const hipRow = Math.round(0.5 * HEIGHT) - 2; // just above the hip line
    const aboveShoulders = Math.round(0.2 * HEIGHT) - 5;
    // Waist line sits below the hip landmark (HEM_OVERHANG_FRACTION), so a
    // row a little below the hip is still shirt at this center column.
    const wellBelowHips = Math.round(0.5 * HEIGHT) + 20;

    expect(shirtMask[shoulderRow * WIDTH + 50]).toBe(1);
    expect(shirtMask[hipRow * WIDTH + 50]).toBe(1);
    expect(shirtMask[aboveShoulders * WIDTH + 50]).toBe(0);
    expect(shirtMask[wellBelowHips * WIDTH + 50]).toBe(0);
  });

  it("shifts the shirt/pants split below the raw hip line to account for a shirt worn untucked", () => {
    const { shirtMask, pantsMask } = deriveBodyRegionMasks(
      BASE_LANDMARKS,
      fullPersonMask(),
      WIDTH,
      HEIGHT,
    );

    const hipRow = Math.round(0.5 * HEIGHT);
    // Right at the hip landmark itself, the shirt (not pants) still owns
    // the center column — the split line is below this row, not at it.
    expect(shirtMask[hipRow * WIDTH + 50]).toBe(1);
    expect(pantsMask[hipRow * WIDTH + 50]).toBe(0);
  });

  it("marks the pants band between the waist and ankles, plus a small cuff extension past the ankle", () => {
    const { pantsMask } = deriveBodyRegionMasks(BASE_LANDMARKS, fullPersonMask(), WIDTH, HEIGHT);

    const midLegRow = Math.round(((0.5 + 0.9) / 2) * HEIGHT);
    const aboveHips = Math.round(0.5 * HEIGHT) - 5;
    const rightAtAnkle = Math.round(0.9 * HEIGHT);
    const wellBelowAnkles = Math.round(0.9 * HEIGHT) + 10;

    expect(pantsMask[midLegRow * WIDTH + 50]).toBe(1);
    expect(pantsMask[aboveHips * WIDTH + 50]).toBe(0);
    // A pant cuff visually extends a little past the raw ankle landmark —
    // this row should still be pants, not left uncovered.
    expect(pantsMask[rightAtAnkle * WIDTH + 50]).toBe(1);
    expect(pantsMask[wellBelowAnkles * WIDTH + 50]).toBe(0);
  });

  it("follows a bent knee that a straight hip-to-ankle line would miss", () => {
    // Hip and ankle both centered around x=0.5, but the knee is kicked far
    // left (x~0.2-0.3) — a real stance (weight shifted, foot placed
    // forward/apart), which is the common case, not an edge case. A single
    // straight hip-to-ankle trapezoid would never reach that x range at any
    // row; the two-segment (hip-to-knee, knee-to-ankle) version should.
    const landmarks = makeLandmarks({
      11: landmark(0.3, 0.2),
      12: landmark(0.7, 0.2),
      13: landmark(0.25, 0.35),
      14: landmark(0.75, 0.35),
      23: landmark(0.45, 0.5),
      24: landmark(0.55, 0.5),
      25: landmark(0.2, 0.7),
      26: landmark(0.3, 0.7),
      27: landmark(0.45, 0.9),
      28: landmark(0.55, 0.9),
    });

    const { pantsMask } = deriveBodyRegionMasks(landmarks, fullPersonMask(), WIDTH, HEIGHT);
    const kneeRow = Math.round(0.7 * HEIGHT);

    expect(pantsMask[kneeRow * WIDTH + 25]).toBe(1);
  });

  it("covers the sleeve along the shoulder-to-elbow line, outside the torso's own width", () => {
    const { shirtMask } = deriveBodyRegionMasks(BASE_LANDMARKS, fullPersonMask(), WIDTH, HEIGHT);

    // Right shoulder (0.7, 0.2) to right elbow (0.75, 0.35): at the row
    // halfway down, the sleeve's center x is ~0.725*100=72.5 — well outside
    // the torso band's own padded width at that row (torso right edge is
    // padded shoulder/hip bounds, nowhere near x=72).
    const midSleeveRow = Math.round(0.275 * HEIGHT);
    expect(shirtMask[midSleeveRow * WIDTH + 72]).toBe(1);
  });

  it("does not extend sleeve coverage down into the pants band", () => {
    // An exaggerated elbow position (down near the hip) shouldn't let the
    // sleeve band leak into pants-band rows — it's clamped to the hip line.
    const landmarks = makeLandmarks({
      11: landmark(0.3, 0.2),
      12: landmark(0.7, 0.2),
      13: landmark(0.25, 0.49),
      14: landmark(0.75, 0.49),
      23: landmark(0.35, 0.5),
      24: landmark(0.65, 0.5),
      25: landmark(0.37, 0.7),
      26: landmark(0.63, 0.7),
      27: landmark(0.4, 0.9),
      28: landmark(0.6, 0.9),
    });

    const { shirtMask, pantsMask } = deriveBodyRegionMasks(
      landmarks,
      fullPersonMask(),
      WIDTH,
      HEIGHT,
    );

    for (let i = 0; i < shirtMask.length; i++) {
      expect(shirtMask[i] && pantsMask[i]).toBeFalsy();
    }
  });

  it("shirt and pants masks never overlap", () => {
    const { shirtMask, pantsMask } = deriveBodyRegionMasks(
      BASE_LANDMARKS,
      fullPersonMask(),
      WIDTH,
      HEIGHT,
    );

    for (let i = 0; i < shirtMask.length; i++) {
      expect(shirtMask[i] && pantsMask[i]).toBeFalsy();
    }
  });

  it("intersects with the person mask, excluding background pixels within the geometric band", () => {
    const personMask = new Uint8Array(WIDTH * HEIGHT); // all background
    const { shirtMask } = deriveBodyRegionMasks(BASE_LANDMARKS, personMask, WIDTH, HEIGHT);

    expect(shirtMask.some((v) => v === 1)).toBe(false);
  });

  it("pads the torso band wider than the raw shoulder-to-hip span", () => {
    const { shirtMask } = deriveBodyRegionMasks(BASE_LANDMARKS, fullPersonMask(), WIDTH, HEIGHT);
    const midTorsoRow = Math.round(((0.2 + 0.5) / 2) * HEIGHT);

    // Raw shoulder span at y=0.2 is x in [30, 70] — padding should extend
    // coverage a bit outside that at the same row.
    expect(shirtMask[midTorsoRow * WIDTH + 28]).toBe(1);
  });

  it("pads the pants band wider than the raw hip-to-knee span, to match a looser pant fit", () => {
    const { pantsMask } = deriveBodyRegionMasks(BASE_LANDMARKS, fullPersonMask(), WIDTH, HEIGHT);
    const midLegRow = Math.round(((0.5 + 0.7) / 2) * HEIGHT);

    // Raw hip span at y=0.5 is x in [35, 65] — padding should extend
    // coverage a bit outside that at the same row.
    expect(pantsMask[midLegRow * WIDTH + 33]).toBe(1);
  });

  it("pads the shirt's bottom edge and the pants' top edge by the same fraction, so the seam has no width discontinuity", () => {
    // Both bands share the hip landmarks as their boundary bound. If they
    // were padded by different fractions (as torso vs. leg padding would
    // naively give), the mask would step inward or outward right at the
    // seam. Same padding fraction on both sides means the two rows
    // immediately above/below the waist line have the same x-range.
    const { shirtMask, pantsMask } = deriveBodyRegionMasks(
      BASE_LANDMARKS,
      fullPersonMask(),
      WIDTH,
      HEIGHT,
    );

    const hipY = 0.5 * HEIGHT;
    const torsoHeight = 0.5 * HEIGHT - 0.2 * HEIGHT;
    const waistY = Math.round(hipY + torsoHeight * 0.12);

    const rowAboveSeam = waistY - 1;
    const rowAtSeam = waistY;

    function rowExtent(mask: Uint8Array, row: number): { left: number; right: number } {
      let left = -1;
      let right = -1;
      for (let x = 0; x < WIDTH; x++) {
        if (mask[row * WIDTH + x]) {
          if (left === -1) left = x;
          right = x;
        }
      }
      return { left, right };
    }

    const above = rowExtent(shirtMask, rowAboveSeam);
    const at = rowExtent(pantsMask, rowAtSeam);

    // Both should be padded hip bounds — same width, allowing a couple px
    // for independent per-row rounding plus the lerp t not landing exactly
    // on 0/1 one row off the seam. This is a tight tolerance compared to
    // the double-digit-pixel step that different padding fractions on
    // either side of the seam used to produce.
    expect(Math.abs(above.right - above.left - (at.right - at.left))).toBeLessThanOrEqual(2);
  });
});
