import { describe, expect, it } from "vitest";
import { applyHueShift } from "./recolor-canvas";

// A 2x1 RGBA image: a steel-blue pixel, then a bright-orange pixel.
function makePixels(): Uint8ClampedArray {
  return new Uint8ClampedArray([70, 130, 180, 255, 230, 126, 34, 255]);
}

describe("applyHueShift", () => {
  it("leaves unmasked pixels untouched", () => {
    const pixels = makePixels();
    const mask = new Uint8Array([1, 0]);

    const result = applyHueShift(pixels, mask, "#ff0000");

    expect([result[4], result[5], result[6], result[7]]).toEqual([230, 126, 34, 255]);
  });

  it("recolors masked pixels toward the target hue while preserving alpha", () => {
    const pixels = makePixels();
    const mask = new Uint8Array([1, 0]);

    const result = applyHueShift(pixels, mask, "#ff0000");

    // Pure red target: G and B channels should collapse toward equal,
    // lower values than R after recoloring (hue shifted toward red).
    expect(result[0]).toBeGreaterThan(result[1]);
    expect(result[0]).toBeGreaterThan(result[2]);
    expect(result[3]).toBe(255); // alpha untouched
  });

  it("preserves the original pixel's lightness (keeps shading/folds intact)", () => {
    const pixels = new Uint8ClampedArray([40, 40, 40, 255]); // a dark, near-black pixel
    const mask = new Uint8Array([1]);

    const result = applyHueShift(pixels, mask, "#ffffff"); // recolor toward white (s=0)

    // White has zero saturation, so hue is irrelevant — the result should
    // just be the original pixel's grayscale lightness, i.e. unchanged.
    expect(result[0]).toBeCloseTo(40, 0);
    expect(result[1]).toBeCloseTo(40, 0);
    expect(result[2]).toBeCloseTo(40, 0);
  });

  it("is a no-op when the mask is all zero", () => {
    const pixels = makePixels();
    const mask = new Uint8Array([0, 0]);

    const result = applyHueShift(pixels, mask, "#00ff00");

    expect(Array.from(result)).toEqual(Array.from(pixels));
  });
});
