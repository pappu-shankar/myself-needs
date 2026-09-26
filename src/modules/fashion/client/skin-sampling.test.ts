import { describe, expect, it } from "vitest";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { estimateSkinSampleRegion, sampleSkinToneLab } from "./skin-sampling";

function landmark(x: number, y: number): NormalizedLandmark {
  return { x, y, z: 0, visibility: 1 };
}

describe("estimateSkinSampleRegion", () => {
  it("centers on the nose and sizes the region from ear-to-ear width", () => {
    const landmarks: NormalizedLandmark[] = Array.from({ length: 33 }, () => landmark(0.5, 0.5));
    landmarks[0] = landmark(0.5, 0.3); // nose
    landmarks[7] = landmark(0.4, 0.3); // left ear
    landmarks[8] = landmark(0.6, 0.3); // right ear

    const region = estimateSkinSampleRegion(landmarks, 200, 400);

    expect(region.centerX).toBeCloseTo(100, 0); // nose.x * 200
    expect(region.radiusX).toBeGreaterThan(0);
    expect(region.radiusY).toBeGreaterThan(0);
    expect(region.centerY).toBeGreaterThan(0.3 * 400); // sampled below the nose, not at it
  });
});

describe("sampleSkinToneLab", () => {
  const WIDTH = 10;
  const HEIGHT = 10;

  function solidColorPixels(r: number, g: number, b: number): Uint8ClampedArray {
    const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
    for (let i = 0; i < WIDTH * HEIGHT; i++) {
      pixels[i * 4] = r;
      pixels[i * 4 + 1] = g;
      pixels[i * 4 + 2] = b;
      pixels[i * 4 + 3] = 255;
    }
    return pixels;
  }

  it("averages a uniform region to that same color's LAB value", () => {
    const pixels = solidColorPixels(198, 134, 66); // a mid skin-tone-like color
    const region = { centerX: 5, centerY: 5, radiusX: 3, radiusY: 3 };

    const lab = sampleSkinToneLab(pixels, WIDTH, HEIGHT, region);

    expect(lab.l).toBeGreaterThan(0);
    expect(Number.isFinite(lab.a)).toBe(true);
    expect(Number.isFinite(lab.b)).toBe(true);
  });

  it("only samples pixels within the ellipse, ignoring a differently colored corner", () => {
    const pixels = solidColorPixels(200, 200, 200);
    // Paint one far corner pixel black — outside the small centered ellipse.
    pixels[0] = 0;
    pixels[1] = 0;
    pixels[2] = 0;

    const region = { centerX: 5, centerY: 5, radiusX: 2, radiusY: 2 };
    const lab = sampleSkinToneLab(pixels, WIDTH, HEIGHT, region);
    const untouchedGray = sampleSkinToneLab(solidColorPixels(200, 200, 200), WIDTH, HEIGHT, region);

    expect(lab.l).toBeCloseTo(untouchedGray.l, 1);
  });

  it("falls back to the center pixel when the region has zero radius", () => {
    const pixels = solidColorPixels(50, 60, 70);
    const region = { centerX: 5, centerY: 5, radiusX: 0, radiusY: 0 };

    const lab = sampleSkinToneLab(pixels, WIDTH, HEIGHT, region);

    expect(Number.isFinite(lab.l)).toBe(true);
  });
});
