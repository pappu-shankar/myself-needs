import { describe, expect, it } from "vitest";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { computePhysiqueSummary } from "./physique-analysis";

const WIDTH = 200;
const HEIGHT = 400;

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

function makeMask(fillFn: (x: number, y: number) => boolean): Uint8Array {
  const mask = new Uint8Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (fillFn(x, y)) mask[y * WIDTH + x] = 1;
    }
  }
  return mask;
}

// Shoulders at y=0.2 (px 80), hips at y=0.5 (px 200) — shoulder width
// 80px, hip width 60px. Elbow/knee deliberately placed above the shoulder
// line (anatomically nonsensical, but this is a synthetic fixture) so
// their midpoint rows land clear of the chest/waist sampling rows below,
// keeping each measurement isolated for testing.
const BASE_LANDMARKS = makeLandmarks({
  11: landmark(0.3, 0.2), // left shoulder
  12: landmark(0.7, 0.2), // right shoulder
  13: landmark(0.3, -0.1), // left elbow
  23: landmark(0.35, 0.5), // left hip
  24: landmark(0.65, 0.5), // right hip
  25: landmark(0.35, -0.1), // left knee
});

const CHEST_ROW = Math.round(80 + (200 - 80) * 0.3); // 116
const WAIST_ROW = Math.round(80 + (200 - 80) * 0.7); // 164

describe("computePhysiqueSummary", () => {
  it("computes shoulderToHipRatio from landmark widths alone, independent of the mask", () => {
    const mask = makeMask(() => false);

    const { ratios } = computePhysiqueSummary(BASE_LANDMARKS, mask, WIDTH, HEIGHT);

    expect(ratios.shoulderToHipRatio).toBeCloseTo(80 / 60, 1);
  });

  it("derives chest/waist width from the person mask's silhouette, not from landmarks", () => {
    const mask = makeMask(
      (x, y) =>
        (y === CHEST_ROW && x >= 66 && x <= 134) || (y === WAIST_ROW && x >= 68 && x <= 132),
    );

    const { ratios } = computePhysiqueSummary(BASE_LANDMARKS, mask, WIDTH, HEIGHT);

    expect(ratios.chestToShoulderRatio).toBeCloseTo(68 / 80, 1);
    expect(ratios.waistToShoulderRatio).toBeCloseTo(64 / 80, 1);
  });

  it("categorizes broad shoulders + belly fullness and reflects it in the description", () => {
    // chest ~0.85x shoulder width ("moderate"), waist ~0.8x ("some_fullness")
    const mask = makeMask(
      (x, y) =>
        (y === CHEST_ROW && x >= 66 && x <= 134) || (y === WAIST_ROW && x >= 68 && x <= 132),
    );

    const { categories, description } = computePhysiqueSummary(BASE_LANDMARKS, mask, WIDTH, HEIGHT);

    expect(categories.shoulders).toBe("broad"); // shoulderToHipRatio 80/60=1.33 > 1.15
    expect(categories.belly).toBe("some_fullness");
    expect(description).toContain("relatively broad shoulders");
    expect(description).toContain("some abdominal/belly fullness");
  });

  it("produces a well-formed description sentence covering all six categories", () => {
    const mask = makeMask(() => true); // full coverage everywhere

    const { description } = computePhysiqueSummary(BASE_LANDMARKS, mask, WIDTH, HEIGHT);

    expect(description).toMatch(/build/);
    expect(description).toMatch(/shoulders/);
    expect(description).toMatch(/chest|midsection/);
    expect(description).toMatch(/limbs/);
    expect(description).toMatch(/silhouette\.$/);
  });

  it("returns 0 (not NaN or a crash) when the mask finds no person pixels in the search window", () => {
    const mask = makeMask(() => false);

    const { ratios } = computePhysiqueSummary(BASE_LANDMARKS, mask, WIDTH, HEIGHT);

    expect(ratios.chestToShoulderRatio).toBe(0);
    expect(ratios.waistToShoulderRatio).toBe(0);
    expect(Number.isNaN(ratios.chestToShoulderRatio)).toBe(false);
  });
});
