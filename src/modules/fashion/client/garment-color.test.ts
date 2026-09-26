import { describe, expect, it } from "vitest";
import { extractGarmentColor } from "./garment-color";

function makePixels(rgba: Array<[number, number, number, number]>): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(rgba.length * 4);
  rgba.forEach(([r, g, b, a], i) => {
    pixels[i * 4] = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    pixels[i * 4 + 3] = a;
  });
  return pixels;
}

describe("extractGarmentColor", () => {
  it("averages only opaque pixels, ignoring transparent (removed-background) ones", () => {
    const pixels = makePixels([
      [255, 255, 255, 0], // transparent background, should be ignored
      [255, 255, 255, 0],
      [100, 50, 25, 255], // garment pixels
      [100, 50, 25, 255],
    ]);

    const lab = extractGarmentColor(pixels);

    // Should match the garment color's LAB, not an average including white.
    expect(lab.l).toBeLessThan(50);
  });

  it("falls back to a neutral gray when every pixel is transparent", () => {
    const pixels = makePixels([
      [10, 10, 10, 0],
      [200, 200, 200, 0],
    ]);

    const lab = extractGarmentColor(pixels);

    expect(Number.isFinite(lab.l)).toBe(true);
    expect(lab.a).toBeCloseTo(0, 0);
    expect(lab.b).toBeCloseTo(0, 0);
  });
});
